import { memo, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import brandMark from "../assets/rag-logo.png";
import { app_routes } from "../constants/routes";
import { useAuth } from "../hooks/use_auth";
import { google_auth_config } from "../requests/auth_request";

export const SignInPage = memo(function SignInPage() {
  const { isReady, isAuthenticated, renderGoogleButton } = useAuth();
  const buttonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      renderGoogleButton(buttonRef.current);
    }
  }, [isAuthenticated, isReady, renderGoogleButton]);

  if (isAuthenticated) {
    return <Navigate to={app_routes.chat} replace />;
  }

  return (
    <section className="grid min-h-screen w-full bg-[#fcfcfd] lg:grid-cols-[1.18fr_0.82fr]">
      <div className="flex flex-col justify-center px-8 py-12 lg:px-20 lg:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-500">
          RAG-AI
        </p>

        <h1 className="mt-6 max-w-2xl text-5xl font-extrabold leading-[1.02] tracking-[-0.05em] text-[#101828] lg:text-7xl">
          Chat with your own knowledge, not the whole internet.
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-9 text-[#5f6c7b] lg:text-[1.18rem]">
          Upload files, isolate conversations, and get answers grounded only in
          your data.
        </p>

        <div className="mt-12 grid max-w-3xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-[#18233d]">Context-aware</h3>
            <p className="mt-2 text-sm leading-7 text-[#627084]">
              Each chat has its own memory space
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-[#18233d]">Multimodal</h3>
            <p className="mt-2 text-sm leading-7 text-[#627084]">
              PDFs, images, audio, video
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-[#18233d]">Fast</h3>
            <p className="mt-2 text-sm leading-7 text-[#627084]">
              Instant grounded responses
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-10 lg:px-10">
        <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm lg:p-12">
          <div className="flex flex-col items-center">
            <img
              src={brandMark}
              alt="RAG AI"
              className="h-auto w-full max-w-[26rem] object-contain"
            />

            <p className="mt-10 text-xs font-semibold uppercase tracking-[0.35em] text-gray-500">
              Welcome
            </p>

            <h2 className="mt-4 text-center text-3xl font-bold tracking-[-0.03em] text-[#101828] lg:text-4xl">
              Sign in to RAG-AI
            </h2>

            <p className="mt-4 max-w-md text-center text-base leading-8 text-[#5f6c7b]">
              Your chats and uploaded data stay private to your account.
            </p>
          </div>

          {!google_auth_config.clientId ? (
            <div className="mt-10 rounded-2xl border border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-700">
              Missing Google Client ID. Add <b>VITE_GOOGLE_CLIENT_ID</b> to
              enable login.
            </div>
          ) : (
            <div className="mt-10 flex justify-center">
              <div ref={buttonRef} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
});
