import { createContext, type ReactNode, useCallback, useEffect } from "react";
import {
  useWhatsAppSignup,
  useWhatsAppSignupEvent,
} from "@/queries/useWhatsAppSignup";

const FB_API_VERSION = "v24.0";

export type SignupPayload = {
  code: string;
  application_id?: string;
  /** Connects the number as this member's own; absent is the organization's. */
  agent_id?: string;
  organization_id?: string;
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
  flow_type?: "only_waba" | "new_phone_number" | "existing_phone_number";
  callback_url?: string;
  verify_token?: string;
};

export type SignupOptions = {
  callback_url?: string;
  verify_token?: string;
  agent_id?: string;
};

// Successful flow data. A coexistence finish may name only the WABA; the
// backend then finds the number on it.
type SuccessfulFlowData = {
  phone_number_id?: string;
  waba_id: string;
  business_id: string;
  ad_account_ids?: string[];
  page_ids?: string[];
  dataset_ids?: string[];
};

// Abandoned flow data
type AbandonedFlowData = {
  current_step: string;
};

// Error flow data
type ErrorFlowData = {
  error_message: string;
  error_id: string;
  session_id: string;
  timestamp: string;
};

// Event listener data type - discriminated union based on event type
type EventListenerData =
  | {
      type: "WA_EMBEDDED_SIGNUP";
      event:
        | "FINISH"
        | "FINISH_ONLY_WABA"
        | "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
      data: SuccessfulFlowData;
    }
  | {
      type: "WA_EMBEDDED_SIGNUP";
      event: "CANCEL";
      data: AbandonedFlowData | ErrorFlowData;
    };

type WhatsAppIntegrationContextType = {
  launchWhatsAppSignup: (
    onSuccess: (phone_number_id: string) => void,
    setLoading: (loading: boolean) => void,
    options?: SignupOptions,
    onError?: (message: string) => void,
  ) => void;
};

export const WhatsAppIntegrationContext = createContext<
  WhatsAppIntegrationContextType | undefined
>(undefined);

export function WhatsAppIntegrationProvider({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    let sessionInfoListener: ((event: MessageEvent) => void) | null = null;

    window.fbAsyncInit = function () {
      window.FB?.init({
        appId: import.meta.env.VITE_META_APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: FB_API_VERSION,
      });
    };

    // Session info listener for capturing WhatsApp Business Account details
    sessionInfoListener = function (event: MessageEvent) {
      // Verify message is from Facebook
      if (!event.origin.endsWith("facebook.com")) {
        return;
      }

      // Filter out messages that are not valid JSON or not from Embedded Signup
      if (
        typeof event.data !== "string" ||
        !event.data.includes("WA_EMBEDDED_SIGNUP")
      ) {
        return;
      }

      let data: EventListenerData;

      try {
        data = JSON.parse(event.data) as EventListenerData;
      } catch (error) {
        console.error("Could not JSON parse event data", error);
        return;
      }

      if (data.type !== "WA_EMBEDDED_SIGNUP") {
        return;
      }

      // Handle cancel events (abandoned or error flows)
      if (data.event === "CANCEL") {
        // TypeScript now knows data.data is AbandonedFlowData | ErrorFlowData
        if ("error_message" in data.data) {
          // ErrorFlowData
          console.warn("Embedded signup error:", data.data);
        } else {
          // AbandonedFlowData
          console.log("User abandoned flow at step:", data.data.current_step);
        }
        window.__waSignupReport?.(data.event, data.data);
        return;
      }

      let flow_type: SignupPayload["flow_type"];

      if (data.event === "FINISH") {
        flow_type = "new_phone_number";
      } else if (data.event === "FINISH_ONLY_WABA") {
        flow_type = "only_waba";
      } else if (data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        flow_type = "existing_phone_number";
      } else {
        console.warn("Unhandled event", data);
        const unhandled = data as { event: string; data?: unknown };
        window.__waSignupReport?.(unhandled.event, unhandled.data);
        return;
      }

      // No type assertion needed - TypeScript knows data.data is SuccessfulFlowData
      window.__waSessionInfo = {
        phone_number_id: data.data.phone_number_id,
        waba_id: data.data.waba_id,
        business_id: data.data.business_id,
        flow_type: flow_type,
      };
    };

    window.addEventListener("message", sessionInfoListener);

    // Copy-pasted from the Embedded Signup integration helper
    (function (d, s, id) {
      const fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      const js = d.createElement(s) as HTMLScriptElement;
      js.id = id;
      js.src = "https://connect.facebook.net/en_US/sdk.js";
      // The SDK is served from connect.facebook.net, which tracking protection
      // (e.g. Firefox ETP) and ad/privacy blockers commonly block. Flag the
      // failure so the onboarding page can show the error up front instead of
      // letting the user click a button that is bound to fail.
      js.onerror = function () {
        window.__fbSdkFailed = true;
        window.dispatchEvent(new Event("fb-sdk-failed"));
      };
      fjs.parentNode?.insertBefore(js, fjs);
    })(document, "script", "facebook-jssdk");

    return () => {
      window.fbAsyncInit = undefined;
      if (sessionInfoListener) {
        window.removeEventListener("message", sessionInfoListener);
      }
    };
  }, []);

  const { mutateAsync: signup } = useWhatsAppSignup();
  const { mutate: reportSignupEvent } = useWhatsAppSignupEvent();

  const launchWhatsAppSignup = useCallback(
    (
      onSuccess: (phone_number_id: string) => void,
      setLoading: (loading: boolean) => void,
      options?: SignupOptions,
      onError?: (message: string) => void,
    ) => {
      window.__waSignupReport = (event, data) =>
        reportSignupEvent({ event, data });

      // Do not let a previous attempt's account IDs leak into a new attempt.
      window.__waSessionInfo = undefined;

      // Launch Facebook login
      window.FB?.login(
        function (response: FBLoginResponse) {
          if (response.authResponse) {
            // Exchange this code for a business integration system user access token
            const code = response.authResponse.code;

            if (!code) {
              console.log("User cancelled login or did not fully authorize.");
              return;
            }

            setLoading(true);

            // Retrieve session info captured from message events
            const sessionInfo: WASessionInfo = window.__waSessionInfo ?? {};

            // Facebook authorization can succeed even when the selected login
            // configuration did not run WhatsApp Embedded Signup. In that
            // case there is no WABA to save, and the API request can only fail.
            if (!sessionInfo.waba_id) {
              const message =
                "Meta authorized the business assets, but did not return a WhatsApp Business Account (WABA). No WhatsApp number was connected. Check that this Meta configuration launches WhatsApp Embedded Signup.";
              window.__waSignupReport?.("AUTH_ONLY_NO_WA_SESSION", {
                has_phone_number_id: false,
              });
              setLoading(false);
              onError?.(message);
              return;
            }

            // Construct payload according to SignupPayload type
            const payload: SignupPayload = {
              code,
              agent_id: options?.agent_id,
              application_id: import.meta.env.VITE_META_APP_ID,
              phone_number_id: sessionInfo.phone_number_id,
              waba_id: sessionInfo.waba_id,
              business_id: sessionInfo.business_id,
              flow_type: sessionInfo.flow_type,
              callback_url: options?.callback_url || undefined,
              verify_token: options?.verify_token || undefined,
            };

            console.info("Submitting WhatsApp signup", {
              has_waba_id: !!payload.waba_id,
              has_phone_number_id: !!payload.phone_number_id,
              flow_type: payload.flow_type,
            });

            signup(payload)
              .then((address) => {
                // A WABA-only finish may not include the phone ID in Meta's
                // event; the backend resolves it and returns the saved row.
                onSuccess(address.address);
              })
              .catch((error: Error) => {
                console.error("Signup failed:", error);
                onError?.(
                  "Meta completed the authorization, but the BSP could not save the WhatsApp account. Check the signup event and backend result before trying again.",
                );
              })
              .finally(() => {
                setLoading(false);
              });
          } else {
            console.log("User cancelled login or did not fully authorize.");
          }
        },
        {
          // A Facebook Login for Business configuration with products selected, which
          // is what makes the flow Embedded Signup v4: https://developers.facebook.com/apps/629323992623834/business-login/configurations/?business_id=153181867762503
          config_id: import.meta.env.VITE_FB_LOGIN_CONFIG_ID,
          response_type: "code", // Must be set to 'code' for System User access token
          override_default_response_type: true,
          extras: {
            setup: {},
          },
        },
      );
    },
    [signup, reportSignupEvent],
  );

  return (
    <WhatsAppIntegrationContext.Provider value={{ launchWhatsAppSignup }}>
      {children}
    </WhatsAppIntegrationContext.Provider>
  );
}
