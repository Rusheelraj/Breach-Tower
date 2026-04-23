import React from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { AuthProvider } from "./auth/AuthContext";
import { msalConfig, SSO_ENABLED } from "./auth/msalConfig";
import App from "./App";
import "./index.css";

const msalInstance = new PublicClientApplication(msalConfig);

function Root() {
  const inner = (
    <AuthProvider>
      <App />
    </AuthProvider>
  );

  // Only wrap with MsalProvider if SSO is configured — avoids MSAL errors
  // when Azure credentials are not yet set
  if (SSO_ENABLED) {
    return <MsalProvider instance={msalInstance}>{inner}</MsalProvider>;
  }
  return inner;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
