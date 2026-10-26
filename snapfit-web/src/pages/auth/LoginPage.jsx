import { login as content } from '../../content/auth';
import AuthShell from './AuthShell';

// /login: the login content page (header menu "Login"); its buttons open the
// bare form screens.
function LoginPage() {
  return <AuthShell content={content} />;
}

export default LoginPage;
