interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleButtonOptions {
  type?: string;
  theme?: string;
  size?: string;
  text?: string;
  shape?: string;
  width?: number;
}

interface GoogleAccountsID {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (element: HTMLElement, options: GoogleButtonOptions) => void;
  disableAutoSelect: () => void;
}

interface GoogleWindow {
  accounts?: {
    id?: GoogleAccountsID;
  };
}

declare global {
  interface Window {
    google?: GoogleWindow;
  }
}

export {};
