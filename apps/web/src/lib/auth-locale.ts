import { defineAuthLocale } from "@better-auth-ui/core";
import type { AuthLocale } from "@better-auth-ui/core";
import { enUS } from "@better-auth-ui/locales/en-US";
import { esES } from "@better-auth-ui/locales/es-ES";

import type { Locale } from "@/i18n/routing";

// Better Auth UI ships English and Spanish bundles. French is the English
// bundle with the sign-in, sign-up and password views translated; the rest of
// the account settings stays English until a French bundle exists.
const frFR = defineAuthLocale({
  ...enUS,
  languageTag: "fr-FR",
  localization: {
    ...enUS.localization,
    auth: {
      ...enUS.localization.auth,
      alreadyHaveAnAccount: "Vous avez déjà un compte ?",
      alreadyVerifiedYourEmail: "Vous avez déjà vérifié votre e-mail ?",
      checkYourEmail:
        "Consultez votre boîte mail pour le lien de vérification.",
      checkYourEmailTitle: "Vérifiez votre e-mail",
      email: "E-mail",
      emailPlaceholder: "vous@exemple.com",
      fieldRequired: "Ce champ est obligatoire.",
      forgotPassword: "Mot de passe oublié",
      forgotPasswordLink: "Mot de passe oublié ?",
      hidePassword: "Masquer le mot de passe",
      invalidEmail:
        "Saisissez une adresse e-mail valide, comme vous@exemple.com.",
      name: "Nom",
      namePlaceholder: "Votre nom",
      needToCreateAnAccount: "Nouveau sur wovain ?",
      newPassword: "Nouveau mot de passe",
      newPasswordPlaceholder: "Nouveau mot de passe",
      or: "ou utilisez votre e-mail",
      password: "Mot de passe",
      passwordPlaceholder: "Mot de passe",
      passwordResetEmailSent:
        "Si un compte utilise cet e-mail, un lien de réinitialisation est en route.",
      passwordResetSuccess: "Mot de passe modifié.",
      passwordResetSuccessDescription:
        "Connectez-vous avec votre nouveau mot de passe.",
      rememberMe: "Se souvenir de moi",
      rememberYourPassword: "Vous vous souvenez de votre mot de passe ?",
      resetPassword: "Enregistrer le nouveau mot de passe",
      sendResetLink: "Envoyer le lien de réinitialisation",
      showPassword: "Afficher le mot de passe",
      signIn: "Se connecter",
      signOut: "Se déconnecter",
      signUp: "Créer un compte",
    },
  },
});

// Google sign-in refused to join an existing wovain account (account_not_linked
// and the other linking errors share this message): Better Auth only joins
// Google to an account whose email is verified. The library's copy blames
// "a different user"; ours says what to do. The error page's button opens
// Account settings, after sign-in when needed.
const LINK_CONFLICT = {
  en: {
    callbackAccountLinkConflictDescription:
      "This email already has a wovain account. Sign in with your email and password, then connect Google in Account settings.",
    callbackAccountLinkConflictTitle: "Sign in with your password first",
  },
  es: {
    callbackAccountLinkConflictDescription:
      "Este correo ya tiene una cuenta de wovain. Inicia sesión con tu correo y contraseña, y luego conecta Google en los ajustes de la cuenta.",
    callbackAccountLinkConflictTitle: "Primero inicia sesión con tu contraseña",
  },
  fr: {
    callbackAccountLinkConflictDescription:
      "Cette adresse a déjà un compte wovain. Connectez-vous avec votre e-mail et votre mot de passe, puis associez Google dans les paramètres du compte.",
    callbackAccountLinkConflictTitle:
      "Connectez-vous d'abord avec votre mot de passe",
    callbackViewAccountSettings: "Paramètres du compte",
  },
} as const satisfies Record<Locale, Partial<typeof enUS.localization.auth>>;

const withLinkConflict = (bundle: AuthLocale, locale: Locale): AuthLocale =>
  defineAuthLocale({
    ...bundle,
    localization: {
      ...bundle.localization,
      auth: { ...bundle.localization.auth, ...LINK_CONFLICT[locale] },
    },
  });

const bundles = {
  en: withLinkConflict(enUS, "en"),
  es: withLinkConflict(esES, "es"),
  fr: withLinkConflict(frFR, "fr"),
};

/** The Better Auth UI messages for a site locale. */
export const authLocaleFor = (locale: Locale) => bundles[locale];
