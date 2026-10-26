import { signIn } from '../../content/auth';
import AuthFormScreen from './AuthFormScreen';
import LoginForm from './LoginForm';

// /signin: the login form on its own, opened by the "Log In" buttons.
function SignInPage() {
  return (
    <AuthFormScreen content={signIn}>
      <LoginForm passwordHelp={signIn.passwordHelp} />
    </AuthFormScreen>
  );
}

export default SignInPage;
