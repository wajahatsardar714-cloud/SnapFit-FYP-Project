import { signUp } from '../../content/auth';
import AuthFormScreen from './AuthFormScreen';
import RegisterForm from './RegisterForm';

// /signup: the sign-up form on its own, opened by the "Get Started" / "Sign Up"
// buttons (pricing links add ?plan=).
function SignUpPage() {
  return (
    <AuthFormScreen content={signUp}>
      <RegisterForm />
    </AuthFormScreen>
  );
}

export default SignUpPage;
