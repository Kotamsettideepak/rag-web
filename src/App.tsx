import { memo } from "react";
import { AppProviders } from "./providers/app_providers";
import { AppRouter } from "./router/app_router";

const App = memo(function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
});

export default App;
