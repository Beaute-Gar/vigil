import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Créer un compte' };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return <AuthForm mode="register" />;
}
