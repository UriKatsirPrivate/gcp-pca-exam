import { AuthForm } from "../AuthForm";

export default function LoginPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
      <p className="mb-6 text-sm text-muted">Sign in to continue your prep.</p>
      <AuthForm mode="login" />
    </div>
  );
}
