import { AuthProvider } from "./auth/googleAuth";
import { ChatWorkspacePage } from './pages/ChatWorkspacePage'

function App() {
  return (
    <AuthProvider>
      <ChatWorkspacePage />
    </AuthProvider>
  )
}

export default App
