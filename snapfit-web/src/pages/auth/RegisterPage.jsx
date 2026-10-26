import { register as content } from '../../content/auth';
import AuthShell from './AuthShell';
import RegisterFieldHelp from './RegisterFieldHelp';

// /register: the sign-up content page (header menu "Get Started"); its buttons
// open the bare form screens, and it explains what the sign-up form asks for.
function RegisterPage() {
  return <AuthShell content={content} below={<RegisterFieldHelp {...content.fieldHelp} />} />;
}

export default RegisterPage;
