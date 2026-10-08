/** Traduit les erreurs d'authentification Supabase en messages pour l'utilisateur. */
export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Email ou mot de passe incorrect.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Un compte existe déjà avec cet email.';
    case 'weak_password':
      return 'Mot de passe trop faible : 8 caractères minimum.';
    case 'email_not_confirmed':
      return 'Confirmez d’abord votre adresse avec le lien reçu par email.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'validation_failed':
      return 'Adresse email invalide.';
    default:
      return 'Une erreur est survenue. Vérifiez votre connexion et réessayez.';
  }
}
