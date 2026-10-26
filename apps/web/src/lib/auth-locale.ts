import { defineAuthLocale } from "@better-auth-ui/core";
import type { AuthLocale } from "@better-auth-ui/core";
import { enUS } from "@better-auth-ui/locales/en-US";
import { esES } from "@better-auth-ui/locales/es-ES";

import type { Locale } from "@/i18n/routing";

// Better Auth UI ships English and Spanish bundles. French is the English
// bundle with the sign-in, sign-up, verify-email and password views
// translated; the rest of
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
      openEmailProvider: "Ouvrir {{provider}}",
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
      resend: "Renvoyer",
      resendIn: "Renvoyer dans {{seconds}} s",
      resetPassword: "Enregistrer le nouveau mot de passe",
      scanToOpenEmailProvider:
        "Scannez pour ouvrir {{provider}} sur votre téléphone",
      sendResetLink: "Envoyer le lien de réinitialisation",
      showPassword: "Afficher le mot de passe",
      signIn: "Se connecter",
      signOut: "Se déconnecter",
      signUp: "Créer un compte",
      verificationEmailSent: "E-mail de vérification envoyé.",
      verifyEmail: "Vérifier l'e-mail",
    },
  },
});

// Our copy over the library's, per locale.
// - Google sign-in refused to join an existing wovain account
//   (account_not_linked and the other linking errors share this message):
//   Better Auth only joins Google to an account whose email is verified, and
//   an unverified password account can't sign in until it is. The library's
//   copy blames "a different user"; ours says what to do. Signing in with the
//   password sends a new confirmation link.
// - The verify-email card sits under our "Check your email" heading
//   (AuthView), so its own line says what to do when the email doesn't come.
const AUTH_COPY = {
  en: {
    callbackAccountLinkConflictDescription:
      "This email already has a wovain account. Confirm your email with the link we sent you, or sign in with your password to get a new link. Then continue with Google.",
    callbackAccountLinkConflictTitle: "Confirm your email first",
    checkYourEmail:
      "No email after a few minutes? Check your spam folder, or send it again.",
  },
  es: {
    callbackAccountLinkConflictDescription:
      "Este correo ya tiene una cuenta de wovain. Confirma tu correo con el enlace que te enviamos, o inicia sesión con tu contraseña para recibir uno nuevo. Luego continúa con Google.",
    callbackAccountLinkConflictTitle: "Primero confirma tu correo",
    checkYourEmail:
      "¿No te llegó en unos minutos? Revisa la carpeta de spam o envíalo de nuevo.",
  },
  fr: {
    callbackAccountLinkConflictDescription:
      "Cette adresse a déjà un compte wovain. Confirmez votre e-mail avec le lien que nous vous avons envoyé, ou connectez-vous avec votre mot de passe pour en recevoir un nouveau. Continuez ensuite avec Google.",
    callbackAccountLinkConflictTitle: "Confirmez d'abord votre e-mail",
    callbackViewAccountSettings: "Paramètres du compte",
    checkYourEmail:
      "Rien reçu après quelques minutes ? Vérifiez vos spams ou renvoyez l'e-mail.",
  },
} as const satisfies Record<Locale, Partial<typeof enUS.localization.auth>>;

const withOurCopy = (bundle: AuthLocale, locale: Locale): AuthLocale =>
  defineAuthLocale({
    ...bundle,
    localization: {
      ...bundle.localization,
      auth: { ...bundle.localization.auth, ...AUTH_COPY[locale] },
    },
  });

const bundles = {
  en: withOurCopy(enUS, "en"),
  es: withOurCopy(esES, "es"),
  fr: withOurCopy(frFR, "fr"),
};

/** The Better Auth UI messages for a site locale. */
export const authLocaleFor = (locale: Locale) => bundles[locale];
