import type { SiteContent } from "@/content/types";
import { ENV } from "@/env.server";

const content: SiteContent = {
  cases: {
    "capsule-collections": {
      description:
        "Lancez une petite capsule en print-on-demand autour d'un thème : idées documentées, visuels vérifiés pour l'impression, fiches Fourthwall à la bonne marge, campagne Meta en pause.",
      exampleBrief:
        "Une capsule de printemps de quatre pièces : dessins botaniques au trait délavés, verts sourds et blanc os, pour celles et ceux qui jardinent sur un balcon.",
      faq: [
        {
          answer:
            "Trois à six pièces, c'est une bonne taille : assez pour former une collection, assez peu pour être éditée avec soin et présentée une à une.",
          question: "Combien de pièces une capsule doit-elle compter ?",
        },
        {
          answer:
            "Oui. Lancez un drop par pièce ou par idée avec le même brief, approuvez les designs qui vont ensemble et rejetez les autres.",
          question: "Les pièces peuvent-elles partager un même style ?",
        },
        {
          answer:
            "Chaque produit est tarifé selon le coût de base de son propre blank. Un tee et un sweat dans la même capsule gardent donc chacun au moins 10 $ de bénéfice et 30 % de marge.",
          question:
            "Comment sont tarifés des blanks différents dans une même capsule ?",
        },
      ],
      lead: "Une capsule est un petit ensemble édité de pièces autour d'une idée. wovain explore le thème, prépare les visuels selon votre direction, met en vente sur Fourthwall les pièces que vous approuvez et prépare la campagne, en pause.",
      name: "Collections capsules",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "Vous pensez en collections, pas en produits isolés. Une capsule doit tenir ensemble : une palette, une ambiance, quelques silhouettes. En print-on-demand, la partie design est le plaisir ; ce sont les fiches, les prix et les publicités de chaque pièce qui font d'une petite capsule un gros chantier.",
      steps: [
        {
          body: "Décrivez le thème, la palette et le public de la capsule, comme vous briefiez un studio.",
          title: "Briefer la capsule",
        },
        {
          body: "wovain propose des directions dans votre thème, chacune avec ses sources et une note sur l'encombrement des fiches similaires.",
          title: "Choisir les directions",
        },
        {
          body: "Approuvez les visuels qui vont ensemble. Renvoyez les autres avec une note, par exemple « même épaisseur de trait que le premier ».",
          title: "Éditer pour la cohérence",
        },
        {
          body: "Les pièces approuvées deviennent des produits Fourthwall masqués sur de vrais blanks, chacun tarifé selon son propre coût de base. Publiez-les ensemble.",
          title: "Mettre l'ensemble en vente",
        },
        {
          body: "Une campagne Meta en pause est prête pour chaque pièce, avec des publicités écrites sous différents angles. Activez-les pour le lancement.",
          title: "Préparer le lancement",
        },
      ],
      tips: [
        "Décidez de la palette avant les motifs. Deux ou trois couleurs d'encre sur toute la capsule la font lire comme une seule collection.",
        "Mêlez les blanks à dessein : un tee, un sweat plus épais et un tote offrent trois niveaux de prix à partir d'une seule idée.",
        "Publiez toutes les pièces le même jour, pour que la capsule arrive d'un bloc et non au compte-gouttes.",
        "Nommez les pièces comme une collection (« Étude de fougère n° 1, 2, 3 ») pour que chaque fiche renvoie aux autres.",
        "Démarrez la campagne avec un petit budget quotidien et voyez à quelle pièce les gens répondent avant de dépenser davantage.",
      ],
      title:
        "Lancer une collection capsule en print-on-demand, éditée par vous",
    },
    "graphic-tees": {
      description:
        "Transformez une idée graphique en tees qui se vendent : designs vérifiés à taille poitrine, vrais blanks Fourthwall tarifés pour 10 $ de bénéfice et campagne Meta en pause.",
      exampleBrief:
        "Des tees épais avec un seul motif d'esprit linogravure, côtier et un peu sec, pour celles et ceux qui nagent en eau froide.",
      faq: [
        {
          answer:
            "À partir du coût de base du blank sur Fourthwall. Un blank à 12 $ se vend 24 $, ce qui laisse 10,33 $ après les frais de carte, la taxe de vente et une réserve pour remboursements.",
          question: "À quel prix se vend un tee typique ?",
        },
        {
          answer:
            "Chaque brouillon est vérifié pour la taille d'impression, la lisibilité à taille poitrine et le nombre de couleurs avant que vous le voyiez.",
          question: "Le visuel s'imprimera-t-il bien ?",
        },
        {
          answer:
            "Pas encore. wovain prépare les visuels à partir de votre brief, et vous les façonnez avec des notes jusqu'à ce qu'ils soient justes.",
          question: "Puis-je importer mes propres illustrations ?",
        },
      ],
      lead: "Un bon tee graphique, c'est une idée forte, bien imprimée et au bon prix. wovain prépare le visuel selon votre direction, le vérifie pour l'impression et met le tee en vente dans votre boutique Fourthwall avec une marge qui tient.",
      name: "Tees graphiques",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "Vous avez un langage graphique : un trait, un style de typographie, une façon de dessiner. Les tees sont le moyen le plus direct de le montrer, et le print-on-demand évite le stock. Ce que vous ne voulez pas, c'est une semaine de maquettes, de guides des tailles, de calculs de prix et de réglages publicitaires pour chaque nouveau tee.",
      steps: [
        {
          body: "Décrivez le motif, le style et qui le porte. Dites ce qu'il faut éviter, par exemple « pas de slogans ».",
          title: "Briefer le visuel",
        },
        {
          body: "wovain prépare des visuels pour chaque idée et les vérifie pour la taille d'impression, la lisibilité à taille poitrine et les couleurs.",
          title: "Voir des brouillons vérifiés",
        },
        {
          body: "Approuvez ceux que vous signeriez. Rejetez avec une note, par exemple « typographie plus lourde », pour un nouveau tour.",
          title: "Éditer et approuver",
        },
        {
          body: "Le tee est créé masqué sur un vrai blank Fourthwall, tarifé selon son coût de base. Publiez quand la page vous convient.",
          title: "Mettre le tee en vente",
        },
        {
          body: "Des publicités sous plusieurs angles attendent dans une campagne Meta en pause jusqu'à ce que vous l'activiez.",
          title: "Préparer les publicités",
        },
      ],
      tips: [
        "Dessinez pour la taille poitrine. Un visuel lisible sur 10 pouces de large se lira dans la rue ; les détails fins, souvent non.",
        "Moins de couleurs d'encre impriment plus proprement et gardent le style cohérent d'une couleur de vêtement à l'autre.",
        "Les blanks épais coûtent plus cher mais portent mieux l'allure d'un label. Le plancher de marge de 30 % garde le prix honnête.",
        "Vérifiez la page produit en ligne sur votre téléphone avant d'en parler à qui que ce soit.",
        "Accordez l'angle publicitaire au visuel : un tee sec et minimal appelle un texte sec et minimal.",
      ],
      title:
        "Tees graphiques en print-on-demand, préparés selon votre direction",
    },
    "independent-labels": {
      description:
        "Le print-on-demand pour labels indépendants : recherche, visuels préparés selon votre direction, fiches Fourthwall à la bonne marge et publicités Meta en pause. Vous approuvez chaque étape.",
      exampleBrief:
        "Un drop d'automne tranquille pour mon label : graphismes workwear délavés, rouille et marine, pour celles et ceux qui réparent leurs vêtements.",
      faq: [
        {
          answer:
            "Vous. Vous écrivez la direction, approuvez chaque pièce et pouvez rejeter n'importe quel brouillon avec une note. Rien n'est mis en vente sans votre accord.",
          question: "Qui décide de ce que mon label sort ?",
        },
        {
          answer:
            "Non. wovain travaille avec des blanks en print-on-demand sur Fourthwall. Il ne gère pas la production en coupe et couture.",
          question: "wovain gère-t-il la coupe et couture ?",
        },
        {
          answer:
            "Dans votre propre boutique Fourthwall, sous le nom de votre label. Fourthwall imprime, expédie et gère le paiement.",
          question: "Où les produits sont-ils vendus ?",
        },
        {
          answer:
            "Non. Chaque campagne est créée en pause, avec le budget quotidien que vous choisissez. La dépense ne commence que lorsque vous l'approuvez, et wovain ne la lance qu'une fois ses règles de dépense en place.",
          question: "Des publicités tourneront-elles sans moi ?",
        },
      ],
      lead: "Vous menez un petit label et chaque sortie représente une semaine d'administratif. wovain prend en charge la recherche, les fiches, les prix et la mise en place des publicités autour d'un drop en print-on-demand, et vous laisse les décisions de goût.",
      name: "Labels indépendants",
      related: ["fourthwall", "fal", "meta", "chatgpt"],
      situation:
        "Votre label compte une à cinq personnes. La même personne assure la direction artistique, le merchandising, les réponses aux e-mails et les publicités. Le print-on-demand permet de sortir sans stock, mais chaque drop demande encore de la recherche, des fichiers, des fiches, des calculs de prix et une campagne. Vous voulez un rythme de sorties régulier sans perdre le style du label.",
      steps: [
        {
          body: "Écrivez la direction comme vous briefiez un studio : ambiance, références, public visé.",
          title: "Fixer la direction",
        },
        {
          body: "wovain regarde ce qui intéresse votre public cette semaine et suggère des idées, chacune avec ses sources.",
          title: "Passer les idées en revue",
        },
        {
          body: "Des visuels sont préparés pour chaque idée et vérifiés pour l'impression. Approuvez ou renvoyez avec une note.",
          title: "Éditer les brouillons",
        },
        {
          body: "Les designs approuvés deviennent des produits masqués dans votre boutique Fourthwall, tarifés pour au moins 10 $ de bénéfice et 30 % de marge.",
          title: "Mettre en vente sur Fourthwall",
        },
        {
          body: "Plusieurs publicités, écrites sous différents angles, attendent dans une campagne Meta en pause jusqu'à ce que vous l'activiez.",
          title: "Préparer la campagne",
        },
      ],
      tips: [
        "Gardez un brief par drop. Une direction ciblée donne un premier tour cohérent.",
        "Dites ce que le label ne fait jamais (« pas de slogans », « pas de néon ») pour que les brouillons partent déjà dans vos règles.",
        "Sortez à un rythme, par exemple un petit drop par mois. Une cadence régulière se promeut plus facilement qu'un gros lancement.",
        "Lisez les sources derrière une idée avant de la choisir. Un thème lié à l'actualité d'une semaine peut vieillir vite.",
        "N'activez le pilote automatique qu'une fois que vous faites confiance aux premiers drops que vous avez menés vous-même.",
      ],
      title:
        "Le print-on-demand pour labels indépendants, sans l'administratif",
    },
    "streetwear-drops": {
      description:
        "Menez des drops streetwear limités en print-on-demand : idées calées sur cette semaine, visuels selon votre direction, fiches Fourthwall à marge juste et publicités Meta en pause.",
      exampleBrief:
        "Un drop d'une semaine de tees et de hoodies oversize, graphismes photocopiés et granuleux, pour celles et ceux qui skatent la nuit.",
      faq: [
        {
          answer:
            "Les pièces en print-on-demand sont fabriquées après chaque commande : un drop n'a donc pas de stock à épuiser. Vous le limitez dans le temps : publiez-le, puis masquez-le dans Fourthwall quand la fenêtre se ferme.",
          question: "Un drop en print-on-demand peut-il être limité ?",
        },
        {
          answer:
            "Les hoodies suivent la même règle que les tees : au moins 10 $ de bénéfice et 30 % de marge sur le coût de base du blank. Un blank à 35 $ se vend 50 $ et laisse 12 $.",
          question: "Comment sont tarifés les hoodies ?",
        },
        {
          answer:
            "wovain contrôle les brouillons pour repérer les noms et marques à éviter, mais vous restez responsable de ce que vous publiez. Gardez les autres marques hors de l'impression.",
          question: "Puis-je faire référence à d'autres marques ?",
        },
      ],
      lead: "Le streetwear vit de son timing. wovain regarde ce qui bouge cette semaine dans votre thème, prépare des visuels selon votre direction, puis met en place les fiches et les publicités pour que le drop soit prêt quand vous l'êtes.",
      name: "Drops streetwear",
      related: ["fourthwall", "fal", "meta"],
      situation:
        "Votre label sort par courtes fenêtres. Chaque drop doit avoir une raison d'exister maintenant, quelques visuels forts et tout en ligne en même temps. En print-on-demand, vous évitez le risque de stock, mais la préparation autour de chaque sortie reste le goulot d'étranglement.",
      steps: [
        {
          body: "Nommez le thème, le style graphique et le public. Ajoutez la fenêtre, par exemple « une semaine ».",
          title: "Briefer le drop",
        },
        {
          body: "Les idées arrivent avec le contexte de cette semaine et une note sur l'encombrement des fiches similaires.",
          title: "Choisir un angle d'actualité",
        },
        {
          body: "Approuvez les visuels qui font mouche. Rejetez les autres avec une note pour un nouveau tour.",
          title: "Éditer les visuels",
        },
        {
          body: "Les produits sont créés masqués sur de vrais blanks et tarifés à la marge. Publiez-les tous à l'heure du drop.",
          title: "Mettre en vente pour le drop",
        },
        {
          body: "La campagne attend, en pause, avec des publicités sous plusieurs angles. Activez-la à l'ouverture du drop.",
          title: "Ouvrir le drop",
        },
      ],
      tips: [
        "Annoncez la fenêtre avant le drop et tenez-la. Masquez les produits dans Fourthwall quand elle se ferme.",
        "Les blanks oversize et épais conviennent à l'allure et portent un prix plus élevé. Le plancher de marge le fixe pour vous.",
        "Utilisez un seul langage graphique pour les tees et les hoodies, afin que le drop se lise comme une seule sortie.",
        "Gardez les autres marques, logos et personnages hors de l'impression.",
        "Ne faites tourner les publicités que pendant que le drop est ouvert, puis désactivez-les.",
      ],
      title: "Drops streetwear en print-on-demand, calés et préparés",
    },
  },
  guides: {
    "launch-a-capsule-drop": {
      description:
        "Un guide pratique pour lancer un drop capsule en print-on-demand : recherche, design et vérifications d'impression, édition, mise en vente sur Fourthwall, variantes de pub et campagne en pause.",
      faq: [
        {
          answer:
            "Trois à six pièces. Assez pour former une collection, assez peu pour être éditée avec soin et promue une à une.",
          question:
            "Combien de pièces une première capsule doit-elle compter ?",
        },
        {
          answer:
            "Commencez petit, quelques dollars par jour, et n'augmentez le budget que pour la publicité qui donne des résultats. Votre bénéfice par vente fixe la limite.",
          question: "Combien dépenser en publicités Meta pour un drop ?",
        },
        {
          answer:
            "Oui : recherche, visuels préparés avec vérifications d'impression, fiches Fourthwall et campagne Meta en pause. Vous approuvez chaque étape, et c'est vous qui activez la campagne.",
          question: "wovain fait-il tout cela ?",
        },
        {
          answer:
            "Oui. Publiez les produits et partagez-les vous-même. La campagne en pause peut attendre le moment où vous voudrez plus de portée.",
          question: "Puis-je lancer sans publicités ?",
        },
      ],
      lead: "Un drop capsule comporte six parties : recherche, design, vérifications, édition, mise en vente et publicités. Voici comment mener chacune, quoi vérifier avant que l'argent ne circule, et une liste de contrôle à garder.",
      published: "2026-10-26",
      readingMinutes: 5,
      sections: [
        {
          heading: "Recherche : goût, timing et encombrement",
          paragraphs: [
            "Les bonnes idées de drop se trouvent là où trois choses se croisent. Votre public aime le thème. Quelque chose le concerne dans l'air du temps cette semaine. Et peu de boutiques le vendent déjà.",
            "Le goût vient en premier. Demandez ce que vos acheteurs aiment aussi : les films, la musique, les lieux et les styles qu'ils partagent. Un label pour celles et ceux qui jardinent trouvera peut-être un filon plus riche dans les matins lents et les vieux catalogues de graines que dans une feuille de plus sur un tee.",
            "Ensuite, le timing. Regardez l'actualité de la semaine passée dans ce thème. Une saison, un anniversaire ou un événement donne au drop une raison d'exister maintenant, et quelque chose à dire dans la publicité.",
            "Enfin, vérifiez les fiches existantes. Cherchez l'idée sur les grandes places de marché de print-on-demand. S'il existe des centaines de quasi-copies, votre version doit être bien meilleure, ou vous devez choisir un autre angle.",
            "Notez pourquoi chaque idée figure sur la liste. Vous réutiliserez ces raisons dans le texte des publicités, et elles vous aident à écarter les idées qui n'avaient l'air bonnes que pour un jour.",
          ],
        },
        {
          heading: "Dessiner, puis vérifier avant que quiconque le voie",
          list: [
            "Taille d'impression : le fichier doit être assez grand pour la zone d'impression. wovain refuse tout ce qui fait moins de 2880 px de large.",
            "Couleurs : l'encre doit se lire sur la couleur du vêtement. Un dessin sombre sur un tee sombre disparaît.",
            "Lisibilité : la typographie et le trait doivent tenir à taille poitrine.",
            "Originalité : pas d'autres marques, artistes, titres de films ou personnages sans en avoir les droits.",
          ],
          paragraphs: [
            "Transformez chaque idée en un bref brief : ce qui est imprimé, le style, les couleurs de vêtement et ce qu'il faut éviter. Puis produisez plusieurs candidats plutôt qu'un seul.",
            "Contrôlez chaque design à l'aune de ces règles simples avant de vous y attacher. Un design qui échoue à l'une d'elles coûte moins cher à corriger maintenant qu'après qu'un client a ouvert son colis.",
            "Dans wovain, chaque brouillon arrive avec un contrôle d'impression marqué prêt ou à retravailler, avec ce qu'il faut corriger. La règle de taille d'impression est fixe : un fichier trop petit ne passe jamais.",
          ],
        },
        {
          heading: "Éditer comme une collection",
          paragraphs: [
            "L'édition est l'endroit où votre regard compte le plus. Approuvez les pièces sur lesquelles vous mettriez votre nom. Rejetez les autres avec une ligne d'explication, comme « typographie trop fine » ou « supprimer les feuilles », pour que le tour suivant soit meilleur.",
            "Éditez pour l'ensemble, pas seulement pour la pièce isolée. Même palette, même épaisseur de trait, une seule ambiance. Une capsule serrée de quatre pièces se lit plus fort qu'une dizaine éparpillée.",
          ],
        },
        {
          heading: "Mettre en vente sur Fourthwall à un prix qui rapporte",
          paragraphs: [
            "Créez chaque produit sur le blank choisi et fixez un prix qui franchit votre plancher après frais. Une règle simple : au moins 10 $ de bénéfice par vente et 30 % de marge, selon la valeur la plus élevée : un tee à 12 $ se vend 24 $, un blank à 25 $ se vend 38 $.",
            "Gardez les produits masqués tant que les pages ne sont pas au point : photos, titre, tailles et prix. Puis publiez l'ensemble d'un coup, et ouvrez chaque page en ligne une fois comme le ferait un acheteur.",
            "Publiez avant d'annoncer. Un message publié alors que les produits sont encore masqués envoie les gens vers un lien mort, et cette première vague d'attention est difficile à regagner.",
          ],
        },
        {
          heading: "Écrire des publicités sous différents angles",
          paragraphs: [
            "Une seule publicité vous apprend très peu. Deux ou trois, chacune sous un angle différent, vous disent à quoi votre public répond.",
            "Choisissez des angles réellement différents : le savoir-faire (comment la pièce est fabriquée et imprimée), l'identité (« pour celles et ceux qui réparent leurs vêtements ») et le moment (la raison d'acheter cette semaine). Gardez le même produit pour que l'angle soit le seul changement.",
            "Gardez le texte court et vrai. Dites ce qu'est la pièce, à qui elle s'adresse et pourquoi maintenant. Évitez les affirmations que vous ne pouvez pas soutenir, comme « meilleure vente » sur un produit lancé aujourd'hui.",
          ],
        },
        {
          heading:
            "Pourquoi la campagne démarre en pause, et comment choisir un budget",
          paragraphs: [
            "Une campagne qui part en ligne dès qu'elle est construite peut dépenser avant que quiconque ait lu les publicités. La construire en pause vous laisse un moment calme pour tout vérifier, et rien n'est dépensé tant que vous n'avez pas décidé.",
            "Pour le budget quotidien, commencez petit. Quelques dollars par jour suffisent à voir quelle publicité obtient des clics sans risquer grand-chose. La dépense publicitaire vient de votre bénéfice par vente : une marge de 10 $ laisse peu de place à des clics coûteux. wovain accepte un budget quotidien de 1 $ à 500 $, et vous pouvez le modifier dans Meta à tout moment.",
            "Laissez chaque test tourner quelques jours avant de le juger. Un après-midi calme en dit peu ; une tendance sur plusieurs jours en dit davantage.",
          ],
        },
        {
          heading: "Votre liste de contrôle avant lancement",
          list: [
            "Chaque pièce est publiée et sa page se charge sur votre téléphone.",
            "Le prix, les tailles et les couleurs de chaque page sont ceux que vous avez approuvés.",
            "Chaque publicité renvoie vers le bon produit.",
            "Les titres ne promettent rien que les pièces ne tiennent pas.",
            "Les pays correspondent à ceux où vous voulez vendre.",
            "Le budget quotidien est un montant que vous acceptez de dépenser chaque jour.",
            "Une publication ou une newsletter est prévue pour le lancement.",
            "Vous savez quand vous regarderez les résultats, par exemple après trois jours.",
          ],
          paragraphs: [
            "Passez cette liste en revue avant d'activer la campagne. Cela prend dix minutes et évite la plupart des erreurs.",
          ],
        },
      ],
      title:
        "Comment lancer un drop capsule en print-on-demand, de l'idée à une campagne en pause",
    },
    "price-print-on-demand": {
      description:
        "Un guide simple pour tarifer des pièces en print-on-demand : coût de base, frais de carte, taxe et remboursements, plancher de 10 $ de bénéfice et de 30 % de marge, avec exemples chiffrés.",
      faq: [
        {
          answer:
            "Assez pour que le travail en vaille la peine après tous les frais. Un plancher de 10 $ par vente, plus au moins 30 % de marge sur les blanks plus chers, est une règle de départ raisonnable.",
          question: "Quel est un bon bénéfice par vente en print-on-demand ?",
        },
        {
          answer:
            "Vous pouvez répercuter la livraison sur l'acheteur, mais des frais de carte s'y appliquent aussi. Comptez ces frais quand vous vérifiez votre bénéfice.",
          question: "Dois-je inclure la livraison dans mon prix ?",
        },
        {
          answer:
            "Doubler convient aux blanks bon marché mais surtarife les blanks chers, et ignore les frais. Un plancher de bénéfice plus un plancher de marge couvrent les deux extrémités.",
          question: "Pourquoi ne pas simplement doubler le coût de base ?",
        },
        {
          answer:
            "Oui. Les produits sont créés masqués dans votre boutique Fourthwall, et vous pouvez y modifier le prix avant ou après la publication.",
          question: "Puis-je changer le prix fixé par wovain ?",
        },
      ],
      lead: "La plupart des prix en print-on-demand déraillent de la même façon : coût de base plus un chiffre rond, et les frais avalent le reste. Voici une règle simple qui garde au moins 10 $ par vente, avec les calculs à l'appui.",
      published: "2026-10-26",
      readingMinutes: 5,
      sections: [
        {
          heading: "Partir du coût de base",
          paragraphs: [
            "Chaque produit en print-on-demand commence par un coût de base : ce que la plateforme facture pour imprimer et fabriquer un article sur un blank donné. Un tee basique peut coûter 12 $, un tee épais 15 $, un hoodie de 25 $ à 35 $. Il varie selon le blank, la zone d'impression et parfois la couleur.",
            "Le coût de base est le seul chiffre que vous ne pouvez pas négocier à chaque vente : c'est donc par lui que le prix doit commencer. Cherchez-le pour le blank et l'impression exacts que vous comptez vendre, pas pour la version la moins chère du produit.",
            "L'erreur est de s'arrêter là et d'ajouter un chiffre rond. « Coût de base plus 10 $ » sonne comme 10 $ de bénéfice, mais ce n'est pas le cas. Plusieurs petits coûts sont prélevés sur chaque vente avant que l'argent n'arrive jusqu'à vous.",
          ],
        },
        {
          heading: "Compter ce qui sort de chaque vente",
          list: [
            "Frais de carte : 2,9 % du prix + livraison + taxe, plus 0,30 $",
            "Livraison : répercutée sur l'acheteur (5 $ dans les exemples ci-dessous)",
            "Taxe de vente : répercutée (7 % dans les exemples ci-dessous)",
            "Réserve pour remboursements : 2 % du prix",
          ],
          paragraphs: [
            "Trois coûts sont faciles à oublier parce qu'ils ne figurent pas sur la page produit.",
            "Les frais de carte. Les prestataires de paiement facturent en général un pourcentage plus un montant fixe par commande. Un taux courant est de 2,9 % plus 0,30 $. Le pourcentage s'applique à toute la commande que paie l'acheteur, livraison et taxe de vente comprises, pas seulement à votre prix.",
            "La taxe de vente. Vous la collectez et la reversez : ce n'est donc pas un revenu. Mais elle agrandit la commande, et donc les frais de carte.",
            "Les remboursements. Certaines commandes reviennent : mauvaise taille, colis perdu, changement d'avis. Mettre de côté une petite part de chaque prix, par exemple 2 %, évite qu'un remboursement n'efface le bénéfice de plusieurs autres ventes.",
          ],
        },
        {
          heading: "Fixer deux planchers : 10 $ de bénéfice et 30 % de marge",
          paragraphs: [
            "Un bon prix franchit deux tests à la fois.",
            "Le plancher de bénéfice : après le coût de base, les frais de carte et la réserve pour remboursements, chaque vente laisse au moins 10 $. C'est assez pour qu'une vente et un e-mail client en valent la peine. Vous pouvez choisir un autre chiffre, mais choisissez-en un et tenez-vous-y.",
            "Le plancher de marge : l'écart entre le prix et le coût de base fait au moins 30 % du prix, ce qui s'écrit (prix − coût de base) ÷ prix ≥ 30 %. Un montant fixe de 10 $ est beaucoup sur un tee à 12 $ mais mince sur un hoodie à 35 $. Le plancher de marge garantit aux pièces plus chères une part équitable.",
            "Prenez le plancher qui donne le prix le plus élevé, puis arrondissez au dollar supérieur. Les prix en dollars entiers se lisent plus proprement sur une page produit.",
          ],
        },
        {
          heading: "Exemples chiffrés",
          list: [
            "Coût de base 8 $ → prix 20 $, bénéfice 10,53 $",
            "Coût de base 12 $ → prix 24 $, bénéfice 10,33 $",
            "Coût de base 15 $ → prix 27 $, bénéfice 10,18 $",
            "Coût de base 20 $ → prix 33 $, bénéfice 10,87 $",
            "Coût de base 25 $ → prix 38 $, bénéfice 10,62 $",
            "Coût de base 35 $ → prix 50 $, bénéfice 12,00 $",
          ],
          paragraphs: [
            "Voici la règle appliquée à six coûts de base, avec 5 $ de livraison, 7 % de taxe, des frais de carte de 2,9 % plus 0,30 $ et une réserve de 2 % pour remboursements. Le bénéfice est ce qui reste après le coût de base, les frais de carte et la réserve.",
            "Prenons le tee à 12 $ pas à pas. Une première estimation de 22 $ (base plus 10 $) paraît correcte. À 22 $, la commande est de 22 $ + 5 $ de livraison + 1,54 $ de taxe = 28,54 $. Les frais de carte sont d'environ 1,13 $ et la réserve de 0,44 $, donc le bénéfice est de 8,43 $. Insuffisant. À 23 $, il est de 9,38 $. À 24 $, la commande est de 30,68 $, les frais de carte de 1,19 $, la réserve de 0,48 $, et le bénéfice de 10,33 $. Le prix est donc 24 $.",
            "Passons au blank à 35 $. Base plus 10 $ donnerait 45 $, mais à 45 $ la marge n'est que de 22 % et le bénéfice après frais de 7,26 $. Le plancher de marge de 30 % fixe le prix à 50 $, ce qui laisse 12,00 $. Pour les blanks chers, c'est le plancher de marge qui compte.",
          ],
        },
        {
          heading: "Quand tarifer plus haut",
          paragraphs: [
            "Les planchers sont un minimum, pas un objectif. Beaucoup de pièces de label peuvent et doivent se vendre au-dessus.",
            "Tarifez plus haut quand le drop est limité, quand le design a demandé un vrai travail ou qu'un collaborateur doit être payé, ou quand vos acheteurs paient déjà plus cher votre label ailleurs. Tarifez aussi plus haut si vous prévoyez des publicités : la dépense publicitaire vient de ces 10 $, et une pièce qui demande de la portée payante a besoin de plus de marge.",
            "Tarifez près du plancher quand l'objectif est la portée plutôt que le revenu : un premier drop, ou une pièce à petit prix qu'on achète sur un coup de tête. Même alors, ne descendez pas sous le plancher. Une vente qui laisse 3 $ ne vaut pas la charge de support.",
            "Quel que soit votre choix, vérifiez les chiffres réels de votre boutique. Les taux de taxe, la livraison et les frais varient selon le pays et la plateforme : appliquez donc la règle avec vos propres valeurs.",
          ],
        },
        {
          heading: "Comment wovain l'applique pour vous",
          paragraphs: [
            "wovain utilise exactement cette règle. Quand un design devient un produit, wovain lit le coût de base réel du blank Fourthwall, puis fixe le plus bas prix en dollars entiers qui franchit à la fois 10 $ de bénéfice et 30 % de marge après frais de carte, taxe de vente et réserve de 2 % pour remboursements. Le prix, le bénéfice et la marge sont affichés avec le produit : vous voyez le calcul, pas seulement la réponse.",
            "La règle est fixe : le pilote automatique ne peut pas l'ignorer. Les produits sont créés masqués : vous pouvez donc modifier le prix dans Fourthwall avant de publier si vous voulez vous placer au-dessus du plancher.",
          ],
        },
      ],
      title:
        "Comment tarifer des pièces en print-on-demand pour que chaque vente dégage un bénéfice",
    },
  },
  integrations: {
    chatgpt: {
      category: "App dans ChatGPT",
      connection: "yours",
      data: "ChatGPT envoie vos demandes à wovain. wovain utilise le même compte, les mêmes drops et les mêmes connexions que le site web : vous pouvez donc démarrer un drop dans le chat et le terminer sur le web.",
      description:
        "Ajoutez wovain à ChatGPT et menez un drop en print-on-demand avec des mots simples : idées, visuels préparés, fiches Fourthwall et campagne Meta en pause, avec votre accord.",
      docsPath: "/docs/chatgpt",
      faq: [
        {
          answer:
            "Oui. Les mêmes étapes, approbations et règles s'appliquent aux deux endroits, et les drops démarrés dans ChatGPT apparaissent sous Exécutions sur le site web.",
          question: "Est-ce la même chose que le site web ?",
        },
        {
          answer:
            "Oui. Demandez un drop avec le pilote automatique activé. Il va jusqu'à un produit publié et une campagne en pause, avec les mêmes limites de prix et de budget que sur le web.",
          question: "Puis-je utiliser le pilote automatique depuis ChatGPT ?",
        },
        {
          answer:
            "Oui. ChatGPT vous donne un lien de connexion pour chaque compte qui manque encore, et vous autorisez votre propre boutique et votre propre compte publicitaire.",
          question: "Dois-je toujours connecter Fourthwall et Meta ?",
        },
      ],
      lead: "Si vous planifiez déjà dans ChatGPT, vous pouvez aussi y mener votre drop. Ajoutez wovain comme app, décrivez le drop et dites oui à chaque étape.",
      name: "ChatGPT",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup: `Dans ChatGPT, activez le mode développeur, ajoutez un connecteur personnalisé avec ${ENV.MCP_URL}, puis connectez-vous à wovain et autorisez l'accès.`,
      steps: [
        {
          body: `Dans les paramètres de ChatGPT, activez le mode développeur et ajoutez un connecteur personnalisé avec l'URL ${ENV.MCP_URL}.`,
          title: "Ajouter wovain à ChatGPT",
        },
        {
          body: "ChatGPT ouvre la page de connexion de wovain. Une fois connecté, vous autorisez ChatGPT à utiliser votre compte wovain.",
          title: "Se connecter et autoriser l'accès",
        },
        {
          body: "Si un compte n'est pas encore connecté, ChatGPT vous donne un lien pour le connecter.",
          title: "Connecter vos comptes",
        },
        {
          body: "Décrivez le drop avec vos propres mots, par exemple « un drop de printemps de dessins botaniques au trait délavés pour mon label ».",
          title: "Demander un drop",
        },
        {
          body: "ChatGPT vous demande votre accord avant d'approuver un design, de mettre des produits en vente ou de construire la campagne. La campagne reste créée en pause.",
          title: "Approuver chaque étape",
        },
      ],
      title:
        "wovain dans ChatGPT : préparer et lancer un drop en print-on-demand depuis un chat",
    },
    fal: {
      category: "Illustration",
      connection: "yours",
      data: "wovain envoie à fal la direction artistique de chaque idée et reçoit le visuel en retour. Les images sont générées sur votre compte fal et conservées avec votre drop.",
      description:
        "Connectez votre compte fal à wovain. Il dessine les visuels de chaque idée selon votre direction, en résolution d'impression, et chaque brouillon est vérifié pour l'impression avant que vous le voyiez.",
      docsPath: "/docs/connecting-accounts#fal",
      faq: [
        {
          answer:
            "fal facture la génération d'images à votre propre compte fal, aux tarifs de fal. L'abonnement wovain est distinct ; voir la page des tarifs.",
          question: "Qui paie les images ?",
        },
        {
          answer:
            "Oui. Vous possédez vos briefs et les designs que vous approuvez.",
          question: "Les visuels m'appartiennent-ils ?",
        },
        {
          answer:
            "Rejetez le brouillon avec une note, par exemple « trait plus lourd », et wovain dessine un nouveau tour pour la même idée.",
          question: "Que faire si un brouillon n'est pas juste ?",
        },
      ],
      lead: "fal est l'endroit où les visuels sont dessinés. wovain transforme chaque idée en direction artistique, fal la dessine sur votre compte, et wovain vérifie le résultat pour l'impression avant que vous l'éditiez.",
      name: "fal",
      related: ["graphic-tees", "capsule-collections", "streetwear-drops"],
      setup: "Ouvrez Connexions dans wovain et connectez votre compte fal.",
      steps: [
        {
          body: "Chaque idée devient une courte direction artistique : ce qui est imprimé, le style, les couleurs et ce qu'il faut éviter.",
          title: "Écrire la direction artistique",
        },
        {
          body: "fal dessine le visuel sur votre compte sous forme d'une illustration d'impression carrée et transparente.",
          title: "Dessiner le visuel",
        },
        {
          body: "Le brouillon est vérifié pour la taille d'impression, la lisibilité à taille poitrine et les couleurs, puis marqué prêt ou à retravailler.",
          title: "Le vérifier pour l'impression",
        },
        {
          body: "Vous approuvez le brouillon ou le renvoyez avec une note pour un nouveau tour.",
          title: "Éditer avec vous",
        },
      ],
      title:
        "fal et wovain : des visuels dessinés selon votre direction, vérifiés pour l'impression",
    },
    fourthwall: {
      category: "Boutique print-on-demand",
      connection: "yours",
      data: "wovain lit les blanks du catalogue et leurs coûts de base, et envoie vos illustrations approuvées, le titre, la description et le prix pour créer des produits dans votre boutique. La connexion est stockée chiffrée, et vous pouvez la déconnecter à tout moment dans Connexions.",
      description:
        "Connectez votre boutique Fourthwall à wovain. Les designs approuvés deviennent des produits sur de vrais blanks, tarifés pour dégager 10 $ de bénéfice par vente, et restent masqués jusqu'à votre publication.",
      docsPath: "/docs/connecting-accounts#fourthwall",
      faq: [
        {
          answer:
            "Oui. wovain crée les produits dans la boutique que vous connectez : ils sont donc à vous dès le départ. Vous continuez à gérer la boutique dans Fourthwall comme d'habitude.",
          question: "Ai-je besoin de ma propre boutique Fourthwall ?",
        },
        {
          answer:
            "Non. Les produits sont créés masqués et passent en ligne quand vous les publiez. La seule exception est le pilote automatique, que vous activez vous-même pour un drop.",
          question: "Des produits passeront-ils en ligne sans moi ?",
        },
        {
          answer:
            "À partir du coût de base du blank : au moins 10 $ de bénéfice par vente et au moins 30 % de marge, selon la valeur la plus élevée, arrondi au dollar supérieur. Vous pouvez ensuite modifier le prix dans Fourthwall.",
          question: "Comment wovain fixe-t-il le prix ?",
        },
        {
          answer:
            "Non. Les commandes, les versements et les messages clients restent dans votre boutique Fourthwall. wovain ne fait que créer et publier des produits.",
          question: "wovain gère-t-il mes commandes ?",
        },
      ],
      lead: "Fourthwall est l'endroit où vos pièces sont mises en vente et vendues. wovain lit son catalogue pour trouver de vrais blanks et leurs coûts de base, puis transforme les designs que vous approuvez en produits dans votre propre boutique.",
      name: "Fourthwall",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup:
        "Connectez-vous à wovain, ouvrez Connexions et autorisez votre propre boutique Fourthwall.",
      steps: [
        {
          body: "wovain consulte les vrais blanks Fourthwall et leurs coûts de base : chaque prix, bénéfice et marge que vous voyez est donc un chiffre réel.",
          title: "Lire le catalogue",
        },
        {
          body: "Le prix part du coût de base du blank et franchit au moins 10 $ de bénéfice et 30 % de marge après frais de carte, taxe de vente et réserve pour remboursements. Un blank à 12 $ se vend 24 $.",
          title: "Tarifer chaque pièce",
        },
        {
          body: "Vos illustrations approuvées sont importées et le produit est créé avec son titre, sa description et son prix. Il reste masqué : rien n'apparaît encore dans votre boutique.",
          title: "Créer le produit, masqué",
        },
        {
          body: "Vous vérifiez le produit et le publiez. C'est seulement alors qu'il passe en ligne dans votre boutique. En pilote automatique, wovain publie pour vous une fois toutes les vérifications passées.",
          title: "Publier quand vous le dites",
        },
      ],
      title:
        "Fourthwall et wovain : du design approuvé à un produit dans votre boutique",
    },
    meta: {
      category: "Publicité",
      connection: "yours",
      data: "wovain envoie le texte des publicités, le lien du produit ainsi que les pays et le budget que vous avez choisis à votre compte publicitaire pour créer la campagne. Il n'active jamais la dépense. La connexion est stockée chiffrée, et vous pouvez la déconnecter à tout moment dans Connexions.",
      description:
        "wovain écrit plusieurs publicités Meta pour chaque pièce et construit la campagne, l'ensemble de publicités et les publicités dans votre compte publicitaire, le tout en pause jusqu'à votre activation.",
      docsPath: "/docs/connecting-accounts#meta",
      faq: [
        {
          answer:
            "Non. Chaque campagne, ensemble de publicités et publicité est créé en pause, et rien n'est dépensé avant que vous approuviez la campagne. wovain la lance alors, mais seulement une fois ses règles de dépense et les règles automatisées de Meta en place.",
          question: "wovain peut-il dépenser mon budget publicitaire ?",
        },
        {
          answer:
            "De 1 $ à 500 $ par jour. Commencer petit est une bonne façon de voir à quelle publicité les gens répondent avant de dépenser davantage.",
          question: "Quel budget quotidien puis-je définir ?",
        },
        {
          answer:
            "Jusqu'à trois par produit, chacune sous un angle différent, avec une publicité par variante dans une même campagne.",
          question: "Combien de publicités wovain écrit-il ?",
        },
        {
          answer:
            "Oui. Ce sont des objets ordinaires de votre compte publicitaire : vous pouvez donc modifier le texte, l'audience ou le budget dans le Gestionnaire de publicités Meta avant de les activer.",
          question: "Puis-je modifier les publicités avant leur diffusion ?",
        },
      ],
      lead: "Meta est l'endroit où vos publicités tournent. wovain écrit les publicités et construit toute la campagne dans votre compte publicitaire, puis s'arrête : la campagne est créée en pause, et vous décidez quand l'argent commence à circuler.",
      name: "Meta",
      related: [
        "independent-labels",
        "capsule-collections",
        "graphic-tees",
        "streetwear-drops",
      ],
      setup:
        "Ouvrez Connexions dans wovain et autorisez votre propre compte publicitaire Meta et votre Page.",
      steps: [
        {
          body: "wovain écrit jusqu'à trois publicités par produit, chacune sous un angle différent, avec son propre titre et son propre message.",
          title: "Écrire les publicités",
        },
        {
          body: "Vous choisissez où les publicités doivent s'afficher et un budget quotidien entre 1 $ et 500 $. Vous pouvez modifier les deux plus tard dans Meta.",
          title: "Choisir les pays et un budget",
        },
        {
          body: "wovain crée une campagne par produit, un ensemble de publicités et une publicité par variante dans votre compte publicitaire. Chaque objet est créé en pause.",
          title: "Construire la campagne, en pause",
        },
        {
          body: "Vérifiez les publicités, l'audience et le budget, dans wovain ou dans le Gestionnaire de publicités Meta, puis approuvez la campagne quand vous êtes prêt à dépenser. wovain la lance une fois ses règles de dépense en place.",
          title: "Vérifier et approuver",
        },
      ],
      title:
        "Publicités Meta pour les drops de votre label, construites pour vous et créées en pause",
    },
  },
};

export default content;
