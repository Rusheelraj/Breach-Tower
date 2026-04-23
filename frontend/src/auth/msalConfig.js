// Microsoft SSO configuration
// Set VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID in your .env to enable SSO.
// If either is blank the SSO button is hidden automatically.

export const msalConfig = {
  auth: {
    clientId:    import.meta.env.VITE_AZURE_CLIENT_ID  || "",
    authority:   `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || "common"}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", "email", "User.Read"],
};

export const SSO_ENABLED =
  !!(import.meta.env.VITE_AZURE_CLIENT_ID && import.meta.env.VITE_AZURE_TENANT_ID);
