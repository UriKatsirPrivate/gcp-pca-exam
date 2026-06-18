import { AuthForm } from "../AuthForm";

export default function RegisterPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-muted">
        Start with a diagnostic, get a tailored plan.
      </p>
      <AuthForm mode="register" />
    </div>
  );
}
