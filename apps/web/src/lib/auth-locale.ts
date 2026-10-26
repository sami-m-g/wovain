import { defineAuthLocale } from "@better-auth-ui/core";
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

const bundles = { en: enUS, es: esES, fr: frFR };

/** The Better Auth UI messages for a site locale. */
export const authLocaleFor = (locale: Locale) => bundles[locale];
