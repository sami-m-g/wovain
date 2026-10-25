import type { SiteContent } from "@/content/types";

const content: SiteContent = {
  cases: {
    "band-merch": {
      description:
        "Le merch de votre groupe autour d'une sortie ou d'une tournée : idées tirées des goûts des fans, designs vérifiés, produits rentables et campagne Meta en pause.",
      exampleBrief:
        "Du merch pour notre nouvel EP shoegaze, look photo argentique délavée, pour des fans qui aiment aussi l'indie des années 90.",
      faq: [
        {
          answer:
            "wovain met les produits en vente dans votre boutique Fourthwall, pensée pour les commandes en ligne. Le stock pour un stand de concert est une commande à part, hors de wovain.",
          question: "Puis-je vendre du merch en concert avec wovain ?",
        },
        {
          answer:
            "Avec la même règle que les t-shirts : au moins 10 $ de profit et 30 % de marge sur le coût de base du blank, selon ce qui donne le prix le plus haut.",
          question: "Comment sont fixés les prix des sweats ?",
        },
        {
          answer:
            "Oui, si elle vous appartient. Vous pouvez la décrire dans le brief, et vous validez chaque design avant toute fabrication.",
          question: "Pouvons-nous utiliser notre pochette d'album ?",
        },
      ],
      lead: "Les fans achètent du merch de groupe pour dire qu'ils y étaient. wovain vous aide à monter un drop autour d'une sortie ou d'une tournée, avec un prix qui vous rapporte à chaque vente et des pubs prêtes, en pause.",
      name: "Merch de groupe",
      related: ["fourthwall", "meta", "qloo", "tavily"],
      situation:
        "Vous jouez dans un groupe ou vous sortez de la musique en solo. Le merch compte, mais votre temps va à l'écriture et à la scène, pas aux fiches produit et aux réglages de pub. Vous voulez quelques belles pièces autour de la prochaine sortie, vendues en ligne, avec une marge sur laquelle compter.",
      steps: [
        {
          body: "Décrivez le disque ou la tournée, l'ambiance visuelle et qui vous écoute.",
          title: "Un brief à partir de la sortie",
        },
        {
          body: "Qloo montre ce que vos auditeurs aiment aussi, du cinéma à la mode, et Tavily ajoute l'actualité de la semaine et vérifie les annonces.",
          title: "Choisir les idées",
        },
        {
          body: "Chaque design est vérifié pour la taille d'impression et l'adéquation. Validez, refusez ou demandez des changements.",
          title: "Valider les designs",
        },
        {
          body: "Les produits sont en ligne dans votre boutique quand vous publiez, à un prix qui laisse au moins 10 $ par vente.",
          title: "Publier sur Fourthwall",
        },
        {
          body: "Jusqu'à trois variantes d'annonce attendent dans une campagne en pause. Lancez-la autour du jour de sortie.",
          title: "Des pubs pour la semaine de sortie",
        },
      ],
      tips: [
        "Reliez le drop à la sortie : la pochette, une parole que vous avez écrite ou les dates de tournée.",
        "Gardez les noms d'autres groupes et titres d'albums hors de l'impression. wovain enregistre les noms associés à votre brief comme noms à ne jamais imprimer.",
        "Les pièces en print-on-demand sont fabriquées après la commande : elles conviennent mieux à la vente en ligne et aux précommandes qu'au stand du concert le soir même.",
        "Publiez quelques jours avant la sortie pour que le lien soit prêt pour vos posts et les pubs du jour J.",
        "Les blanks plus chers, comme les sweats à capuche, ont un prix fixé par le plancher de 30 % de marge. Un blank à 35 $ se vend 50 $ et laisse encore 12 $.",
      ],
      title:
        "Merch de groupe : concevoir, fixer le prix et lancer un drop autour d'une sortie",
    },
    "creator-merch": {
      description:
        "Votre merch de créateur en une phrase : idées tirées des goûts de votre audience, designs vérifiés, produits Fourthwall rentables et campagne Meta en pause.",
      exampleBrief:
        "Du merch sobre et minimaliste pour ma chaîne de cuisine maison, couleurs chaudes, pas de logo géant.",
      faq: [
        {
          answer:
            "La recherche et le premier design prennent quelques minutes. Le reste dépend du temps que vous passez à choisir et à valider.",
          question: "Combien de temps prend un drop ?",
        },
        {
          answer:
            "Non. Vous validez ou donnez votre avis en langage courant, et wovain crée un autre design pour la même idée.",
          question: "Faut-il savoir dessiner ?",
        },
        {
          answer:
            "Le coût de base du blank, les frais de carte et la réserve que wovain prévoit pour les remboursements. Le prix est fixé pour que vous gardiez au moins 10 $ par vente après tout ça.",
          question: "Combien me coûte chaque vente ?",
        },
        {
          answer:
            "Ça fonctionne avec les blanks du catalogue Fourthwall. wovain commence par le print-on-demand et s'oriente vers le vêtement fabriqué à la demande.",
          question: "Est-ce seulement pour les t-shirts ?",
        },
      ],
      lead: "Votre audience, vous la connaissez. Ce qui prend du temps, c'est la recherche, les visuels, les fiches produit et la configuration des pubs. wovain s'en charge, et vous validez chaque étape.",
      name: "Merch de créateur",
      related: ["fourthwall", "meta", "qloo", "nebius"],
      situation:
        "Vous faites des vidéos, des posts ou un podcast, et on vous réclame du merch. Vous avez une boutique Fourthwall, ou vous êtes sur le point d'en ouvrir une, mais un drop représente une semaine de recherche, de fichiers, de calculs de prix et de réglages dans le Gestionnaire de publicités. Vous voulez des produits que vos fans porteraient vraiment, à un prix qui vous laisse un vrai profit.",
      steps: [
        {
          body: "Dites pour qui est le drop et l'ambiance voulue. C'est tout le brief.",
          title: "Écrire une phrase",
        },
        {
          body: "wovain propose des idées notées selon ce que votre audience aime aussi, l'actualité de la semaine et la concurrence en ligne, avec les sources.",
          title: "Choisir parmi des idées classées",
        },
        {
          body: "Chaque design arrive avec l'avis de NVIDIA Nemotron : verdict, note et corrections. Validez-le, ou dites quoi changer pour en obtenir un nouveau.",
          title: "Valider les designs",
        },
        {
          body: "Les designs validés deviennent des produits masqués sur de vrais blanks, avec au moins 10 $ de profit par vente. Publiez quand ça vous plaît.",
          title: "Publier sur Fourthwall",
        },
        {
          body: "wovain rédige jusqu'à trois variantes d'annonce et monte une campagne Meta créée en pause. Vous la lancez quand vous êtes prêt.",
          title: "Vérifier la campagne en pause",
        },
      ],
      tips: [
        "Écrivez le brief sur votre audience, pas sur votre logo. « Des fans de cuisine mijotée qui aiment le lin et les tons terreux » donne de meilleures idées que « mon logo sur un sweat ».",
        "Dites ce qu'il faut éviter. « Pas trop de jeux de mots » ou « pas de fluo » vous épargne un tour de retours.",
        "Commencez par un ou deux produits. Un petit drop est plus facile à présenter et plus rapide à évaluer.",
        "Lisez les sources de l'idée choisie. Si l'actualité derrière sera dépassée dans un mois, lancez vite ou choisissez un thème plus durable.",
        "Lancez la campagne avec un petit budget quotidien et regardez quel angle fait cliquer avant de dépenser plus.",
      ],
      title: "Du merch de créateur sans la corvée : un brief, un drop prêt",
    },
    "twitch-merch": {
      description:
        "Votre merch Twitch en un court brief : idées liées aux goûts de votre communauté, designs vérifiés, produits Fourthwall rentables et pubs Meta en pause.",
      exampleBrief:
        "Du merch pour mes streams de jeux de ferme cosy, couleurs pastel douces, autour de la blague du chat « encore un jour ».",
      faq: [
        {
          answer:
            "Les emotes créées pour vous conviennent bien, tant que vous possédez le visuel. Évitez les visuels de jeux et le travail d'autres créateurs.",
          question: "Puis-je mettre des emotes sur du merch ?",
        },
        {
          answer:
            "Ça dépend du blank. Un blank à 12 $ sort à 24 $, ce qui laisse environ 10,33 $ après frais et réserve pour remboursements.",
          question: "Combien coûtera un t-shirt à mes viewers ?",
        },
        {
          answer:
            "Non. La campagne est créée en pause. Vous pouvez vendre uniquement à votre stream et lancer les pubs plus tard, ou jamais.",
          question: "Suis-je obligé de faire de la pub ?",
        },
      ],
      lead: "Votre chat écrit déjà votre meilleur merch : emotes, blagues récurrentes, moments que tout le monde a clippés. wovain vous aide à en faire des produits et des pubs sans une semaine de préparation.",
      name: "Merch Twitch",
      related: ["fourthwall", "meta", "tavily", "nebius"],
      situation:
        "Vous streamez sur Twitch et votre communauté a son propre langage. Vous voulez du merch que les habitués reconnaissent, prêt pour un palier ou un stream événement, et à un prix qui rend chaque vente intéressante.",
      steps: [
        {
          body: "Indiquez le jeu ou le genre, l'ambiance et la blague récurrente que vous voulez sur le produit.",
          title: "Un brief avec la blague",
        },
        {
          body: "wovain classe les idées selon les goûts plus larges de votre audience et l'actualité de la semaine, et montre combien d'annonces similaires existent.",
          title: "Choisir les idées",
        },
        {
          body: "Regardez le verdict et les corrections, validez ceux que vous porteriez en stream, ou demandez-en un autre.",
          title: "Valider les designs",
        },
        {
          body: "Publiez sur Fourthwall avant votre palier ou votre stream événement pour que le lien soit prêt.",
          title: "Publier avant le stream",
        },
        {
          body: "Votre campagne Meta attend, en pause, jusqu'à ce que vous vouliez toucher des gens hors de votre chat.",
          title: "Toucher de nouveaux viewers",
        },
      ],
      tips: [
        "Calez le drop sur un moment que votre communauté fête déjà : un palier d'abonnés, un stream anniversaire ou un événement caritatif.",
        "Portez ou montrez le produit en stream. On achète ce qu'on a vu porté.",
        "Ajoutez le lien de la boutique dans vos panneaux et une commande de chat, pour qu'il soit à un clic pendant le stream.",
        "Gardez les logos et personnages de jeux hors de l'impression si vous n'avez pas les droits. Les blagues inventées par votre chat, elles, sont à vous.",
        "Laissez quelques jours après la publication avant une grosse annonce, le temps de vérifier la page produit.",
      ],
      title: "Merch Twitch : transformez les blagues de votre chat en drop",
    },
    "youtube-merch": {
      description:
        "Votre merch YouTube en un brief : idées tirées des goûts de vos abonnés, designs vérifiés, produits Fourthwall rentables et pubs Meta en pause.",
      exampleBrief:
        "Du merch pour ma chaîne de réparation de synthés vintage, style couverture de vieux manuel, pour ceux qui adorent réparer le vieux matériel.",
      faq: [
        {
          answer:
            "Non. Le prix est fixé pour que chaque vente laisse au moins 10 $ : un petit drop pour une audience fidèle reste rentable à chaque commande.",
          question: "Faut-il une grosse chaîne pour vendre du merch ?",
        },
        {
          answer:
            "Oui, s'ils sont à vous. wovain garde hors de l'impression les noms d'autres marques, artistes et titres associés à votre sujet.",
          question: "Puis-je utiliser le nom ou le logo de ma chaîne ?",
        },
        {
          answer:
            "Non. La campagne est créée en pause. Rien n'est dépensé tant que vous ne la lancez pas dans Meta.",
          question: "Les pubs démarrent-elles dès la publication ?",
        },
      ],
      lead: "Vos abonnés ont déjà leurs blagues internes, leurs rubriques fétiches et une ambiance qu'ils reconnaissent. wovain en fait un drop sur Fourthwall et une campagne Meta en pause, en vous demandant votre avis à chaque étape.",
      name: "Merch YouTube",
      related: ["fourthwall", "meta", "qloo", "tavily"],
      situation:
        "Vous avez une chaîne YouTube et les commentaires réclament du merch. Vous voulez quelque chose qui colle à la chaîne sans être un logo posé sur un t-shirt, et pouvoir en parler en vidéo sans craindre que le prix ne vous laisse rien.",
      steps: [
        {
          body: "Décrivez le sujet de la chaîne et l'ambiance du drop en une phrase.",
          title: "Un brief à partir de la chaîne",
        },
        {
          body: "Les idées sont classées selon ce que vos abonnés aiment aussi et l'actualité de la semaine, avec la vérification des annonces qui montre la concurrence pour chacune.",
          title: "Choisir des idées argumentées",
        },
        {
          body: "Chaque design arrive avec un contrôle de taille d'impression et la note du juge. Validez, ou demandez des changements.",
          title: "Valider des designs vérifiés",
        },
        {
          body: "Publiez les produits sur Fourthwall, puis parlez-en dans votre prochaine vidéo avec le lien prêt.",
          title: "Publier, puis tourner",
        },
        {
          body: "La campagne Meta attend, en pause. Lancez-la pour toucher des gens au-delà de vos abonnés.",
          title: "Lancer les pubs pour toucher plus large",
        },
      ],
      tips: [
        "Construisez le drop autour d'une rubrique ou d'une réplique que vos habitués connaissent. Ça se lit comme un clin d'œil aux fans, pas comme une pub.",
        "Publiez avant de tourner la mention, pour que le lien marche dès la mise en ligne de la vidéo.",
        "Mettez le lien du produit dans la description et dans un commentaire épinglé, et dites-le une fois à voix haute dans la vidéo.",
        "Si votre chaîne est éligible à YouTube Shopping, Fourthwall peut s'y connecter pour afficher vos produits à côté de vos vidéos. Vérifiez l'éligibilité dans vos réglages YouTube et Fourthwall.",
        "Choisissez l'angle de pub qui ressemble à votre façon de parler à la caméra. Si vous êtes sobre et technique, prenez la variante qui l'est aussi.",
      ],
      title: "Merch YouTube : un drop que vos abonnés porteront vraiment",
    },
  },
  guides: {
    "launch-a-merch-drop": {
      description:
        "Guide pratique : lancer un drop de merch : recherche, designs et contrôles d'impression, validation, publication sur Fourthwall, pubs et campagne Meta en pause.",
      faq: [
        {
          answer:
            "Un ou deux. C'est plus facile à expliquer, à promouvoir et à évaluer qu'une grande collection.",
          question: "Combien de produits pour un premier drop ?",
        },
        {
          answer:
            "Commencez petit, quelques dollars par jour, et n'augmentez le budget que sur la variante qui donne des résultats. Votre profit par vente fixe la limite.",
          question: "Combien dépenser en pubs Meta pour du merch ?",
        },
        {
          answer:
            "Oui : recherche, designs vérifiés, produits Fourthwall et campagne Meta en pause. Vous validez chaque étape, et c'est vous qui lancez la campagne.",
          question: "wovain fait-il tout cela ?",
        },
        {
          answer:
            "Oui. Publiez les produits et partagez-les vous-même. La campagne en pause peut attendre que vous vouliez plus de portée.",
          question: "Puis-je lancer sans pubs ?",
        },
      ],
      lead: "Un drop de merch, c'est six étapes : recherche, design, contrôles, validation, publication et pubs. Voici comment mener chacune, quoi vérifier avant que l'argent ne commence à partir, et une checklist à garder.",
      published: "2026-10-25",
      readingMinutes: 5,
      sections: [
        {
          heading: "Recherche : goûts, moment et concurrence",
          paragraphs: [
            "Les bonnes idées de merch se trouvent là où trois choses se croisent. Votre audience aime le thème. Il se passe quelque chose autour cette semaine. Et peu de boutiques le vendent déjà.",
            "Les goûts d'abord. Demandez-vous ce que les gens qui vous regardent, vous écoutent ou vous lisent aiment aussi : les films, la musique, les loisirs et les styles qu'ils partagent. Les abonnés d'une chaîne sur les plantes aiment peut-être aussi la vie lente et la randonnée, et c'est une piste plus riche qu'une énième feuille sur un t-shirt.",
            "Ensuite le moment. Regardez l'actualité de la semaine dans ce thème. Une saison, un anniversaire ou une sortie donne au drop une raison d'exister maintenant, et quelque chose à dire dans la pub.",
            "Enfin, vérifiez les annonces. Cherchez l'idée sur des places de marché comme Etsy, Redbubble et Fourthwall. S'il existe des centaines de quasi-copies, votre version doit être bien meilleure, ou mieux vaut choisir un autre angle.",
            "Notez pourquoi chaque idée est retenue : le lien de goût, l'actualité et le nombre d'annonces. Vous réutiliserez ces raisons dans le texte des pubs, et elles aident à écarter les idées qui ne brillaient qu'un jour.",
          ],
        },
        {
          heading: "Concevoir, puis vérifier avant que quiconque ne voie",
          list: [
            "Taille d'impression : le fichier doit être assez grand pour la zone d'impression. wovain refuse tout ce qui fait moins de 2880 px de large.",
            "Couleurs : l'encre doit ressortir sur la couleur du vêtement. Un visuel sombre sur un t-shirt sombre disparaît.",
            "Fiche : un titre clair et une description qui dit ce qu'est le produit, sans en promettre trop.",
            "Originalité : pas d'autres marques, artistes, titres de films ou personnages sans les droits.",
          ],
          paragraphs: [
            "Transformez l'idée en court brief : ce qui est imprimé, le style, les couleurs du vêtement et ce qu'il faut éviter. Puis faites plusieurs propositions plutôt qu'une seule.",
            "Vérifiez chaque design au regard des règles ennuyeuses avant de vous y attacher. Un design qui en rate une coûte moins cher à corriger maintenant qu'après l'ouverture du colis par un client.",
            "Dans wovain, chaque design arrive avec l'avis de NVIDIA Nemotron : un verdict prêt ou à revoir, une note sur 100 et jusqu'à cinq corrections. La règle de taille d'impression est tranchée par le code : un fichier trop petit ne passe jamais.",
          ],
        },
        {
          heading: "Valider avec une raison",
          paragraphs: [
            "La validation, c'est là que vous apportez ce qu'aucun outil ne peut : votre connaissance de votre audience. Validez les designs que vous porteriez vous-même. Refusez les autres avec une ligne d'explication, comme « typo trop fine » ou « enlève les feuilles », pour que le tour suivant soit meilleur.",
            "Un ou deux produits forts valent mieux que six moyens. Un petit drop est plus facile à présenter en vidéo et plus rapide à évaluer.",
          ],
        },
        {
          heading: "Publier sur Fourthwall à un prix qui rapporte",
          paragraphs: [
            "Créez chaque produit sur le blank choisi et fixez un prix qui passe votre plancher après frais. Une règle simple : au moins 10 $ de profit par vente et 30 % de marge, selon ce qui donne le prix le plus haut. Un t-shirt à 12 $ se vend 24 $, un blank à 25 $ se vend 38 $.",
            "Gardez le produit masqué tant que la page n'est pas prête : photos, titre, tailles et prix. Puis publiez, et ouvrez la page en ligne une fois comme le ferait un acheteur.",
            "Publiez avant d'annoncer. Une vidéo ou un post qui sort alors que le produit est encore masqué envoie les gens vers un lien mort, et cette première vague d'attention se rattrape mal.",
          ],
        },
        {
          heading: "Rédiger des variantes de pub sous différents angles",
          paragraphs: [
            "Une seule annonce vous apprend très peu. Deux ou trois, chacune sous un angle différent, vous disent à quoi votre audience réagit.",
            "Choisissez des angles vraiment différents : la blague interne (pour ceux qui vous connaissent déjà), l'identité (« pour ceux qui réparent eux-mêmes leurs synthés ») et le moment (la raison d'acheter cette semaine). Donnez à chacune son titre et son message, et gardez le même produit pour que l'angle soit la seule différence.",
            "Gardez un texte court et vrai. Dites ce qu'est le produit, pour qui il est et pourquoi maintenant. Évitez les affirmations que vous ne pouvez pas prouver, comme « best-seller » pour un produit lancé aujourd'hui.",
          ],
        },
        {
          heading:
            "Pourquoi la campagne démarre en pause, et comment choisir un budget",
          paragraphs: [
            "Une campagne qui se lance dès sa création peut dépenser avant que quiconque ait relu les annonces. La créer en pause vous laisse un moment au calme pour tout vérifier, et rien n'est dépensé avant votre décision.",
            "Pour le budget quotidien, commencez petit. Quelques dollars par jour et par campagne suffisent pour voir quelle variante obtient des clics, sans grand risque. Souvenez-vous que la dépense pub sort de votre profit par vente : avec 10 $ de marge, il reste peu de place pour des clics chers. N'augmentez le budget que sur la variante qui marche. wovain accepte un budget quotidien de 1 $ à 500 $, et vous pouvez le changer dans Meta à tout moment.",
            "Laissez quelques jours à chaque test avant de juger. Un après-midi calme ne dit pas grand-chose ; une tendance sur plusieurs jours en dit plus.",
          ],
        },
        {
          heading: "Votre checklist avant lancement",
          list: [
            "Le produit est publié et la page s'ouvre bien sur votre téléphone.",
            "Prix, tailles et couleurs sur la page correspondent à ce que vous avez validé.",
            "Chaque annonce renvoie vers le bon produit.",
            "Le titre et le message se lisent bien et ne promettent rien que le produit ne fait pas.",
            "Les pays correspondent à ceux où vous voulez vendre.",
            "Le budget quotidien est un montant que vous acceptez de dépenser chaque jour.",
            "Une vidéo, un post ou un stream est prévu pour parler du drop.",
            "Vous savez quand vous regarderez les résultats, par exemple au bout de trois jours.",
          ],
          paragraphs: [
            "Passez-la avant de lancer la campagne. Ça prend dix minutes et ça évite la plupart des erreurs.",
          ],
        },
      ],
      title:
        "Comment lancer un drop de merch : de l'idée à une campagne Meta en pause",
    },
    "price-print-on-demand-merch": {
      description:
        "Fixer le prix d'un merch print-on-demand : coût de base, frais, taxe, remboursements, plancher de 10 $ de profit et de 30 % de marge, avec exemples chiffrés.",
      faq: [
        {
          answer:
            "Assez pour que le travail en vaille la peine une fois tous les frais payés. Un plancher de 10 $ par vente, plus au moins 30 % de marge sur les blanks chers, est une bonne règle de départ.",
          question: "Quel profit viser par vente en print-on-demand ?",
        },
        {
          answer:
            "Vous pouvez refacturer la livraison à l'acheteur, mais les frais de carte s'appliquent aussi dessus. Comptez-les quand vous vérifiez votre profit.",
          question: "Faut-il inclure la livraison dans le prix ?",
        },
        {
          answer:
            "Doubler marche pour les blanks bon marché mais surévalue les chers, et ignore les frais. Un plancher de profit plus un plancher de marge couvrent les deux cas.",
          question: "Pourquoi ne pas simplement doubler le coût de base ?",
        },
        {
          answer:
            "Oui. Les produits sont créés masqués dans votre boutique Fourthwall, et vous pouvez y modifier le prix avant ou après publication.",
          question: "Puis-je changer le prix fixé par wovain ?",
        },
      ],
      lead: "La plupart des prix de merch ratent de la même façon : coût de base plus un chiffre rond, et les frais mangent le reste. Voici une règle simple qui garde au moins 10 $ par vente, calculs à l'appui.",
      published: "2026-10-25",
      readingMinutes: 5,
      sections: [
        {
          heading: "Partir du coût de base",
          paragraphs: [
            "Tout produit print-on-demand commence par un coût de base : ce que la plateforme facture pour imprimer et fabriquer une pièce sur un blank donné. Un t-shirt simple peut coûter 12 $, un t-shirt plus épais 15 $, un sweat à capuche de 25 $ à 35 $. Il varie selon le blank, la zone d'impression et parfois la couleur.",
            "Le coût de base est le seul chiffre que vous ne négociez pas vente par vente : c'est donc là que le calcul doit commencer. Regardez-le pour le blank et l'impression exacts que vous comptez vendre, pas pour la version la moins chère du produit.",
            "L'erreur est de s'arrêter là et d'ajouter un chiffre rond. « Coût de base plus 10 $ » ressemble à 10 $ de profit, mais ce n'en est pas. Plusieurs petits coûts sortent de chaque vente avant que l'argent ne vous arrive.",
          ],
        },
        {
          heading: "Compter ce qui sort de chaque vente",
          list: [
            "Frais de carte : 2,9 % du prix + livraison + taxe, plus 0,30 $",
            "Livraison : refacturée à l'acheteur (5 $ dans les exemples ci-dessous)",
            "Taxe de vente : reversée (7 % dans les exemples ci-dessous)",
            "Réserve pour remboursements : 2 % du prix",
          ],
          paragraphs: [
            "Trois coûts s'oublient facilement parce qu'ils ne figurent pas sur la fiche produit.",
            "Les frais de carte. Les prestataires de paiement prennent en général un pourcentage plus un montant fixe par commande. Un taux courant est 2,9 % plus 0,30 $. Le pourcentage s'applique à toute la commande payée par l'acheteur, livraison et taxe comprises, pas seulement à votre prix.",
            "La taxe de vente. Vous la collectez et la reversez : ce n'est pas un revenu. Mais elle grossit la commande, et donc les frais de carte.",
            "Les remboursements. Certaines commandes reviennent : mauvaise taille, colis perdu, changement d'avis. Mettre de côté une petite part de chaque prix, par exemple 2 %, évite qu'un remboursement n'efface le profit de plusieurs autres ventes.",
          ],
        },
        {
          heading: "Fixer deux planchers : 10 $ de profit et 30 % de marge",
          paragraphs: [
            "Un bon prix passe deux tests à la fois.",
            "Le plancher de profit : après coût de base, frais de carte et réserve pour remboursements, chaque vente laisse au moins 10 $. C'est assez pour qu'une vente vaille une mention en vidéo et un e-mail client. Vous pouvez choisir un autre chiffre, mais choisissez-en un et tenez-vous-y.",
            "Le plancher de marge : l'écart entre le prix et le coût de base représente au moins 30 % du prix, soit (prix − coût de base) ÷ prix ≥ 30 %. 10 $ fixes, c'est beaucoup sur un t-shirt à 12 $ mais c'est mince sur un sweat à 35 $. Le plancher de marge garantit que les articles plus chers gardent une part juste, pour qu'un remboursement ou une petite hausse de frais ne vous ramène pas à zéro.",
            "Prenez le plancher qui donne le prix le plus haut, puis arrondissez au dollar supérieur. Un prix rond se lit mieux et se dit plus facilement en vidéo.",
          ],
        },
        {
          heading: "Exemples chiffrés",
          list: [
            "Coût de base 8 $ → prix 20 $, profit 10,53 $",
            "Coût de base 12 $ → prix 24 $, profit 10,33 $",
            "Coût de base 15 $ → prix 27 $, profit 10,18 $",
            "Coût de base 20 $ → prix 33 $, profit 10,87 $",
            "Coût de base 25 $ → prix 38 $, profit 10,62 $",
            "Coût de base 35 $ → prix 50 $, profit 12,00 $",
          ],
          paragraphs: [
            "Voici la règle appliquée à six coûts de base, avec 5 $ de livraison, 7 % de taxe, des frais de carte de 2,9 % plus 0,30 $ et une réserve de 2 %. Le profit est ce qui reste après le coût de base, les frais de carte et la réserve.",
            "Prenons le t-shirt à 12 $ pas à pas. Un premier essai à 22 $ (coût plus 10 $) semble correct. À 22 $, la commande fait 22 $ + 5 $ de livraison + 1,54 $ de taxe = 28,54 $. Les frais de carte font environ 1,13 $ et la réserve 0,44 $ : le profit est de 8,43 $. Pas assez. À 23 $, on arrive à 9,38 $. À 24 $, la commande fait 30,68 $, les frais 1,19 $, la réserve 0,48 $, et le profit 10,33 $. Le prix est donc 24 $.",
            "Passons au blank à 35 $. Coût plus 10 $ donnerait 45 $, mais à 45 $ la marge n'est que de 22 % et le profit après frais de 7,26 $. Le plancher de 30 % de marge fixe le prix à 50 $, ce qui laisse 12,00 $. Pour les blanks chers, c'est le plancher de marge qui compte.",
          ],
        },
        {
          heading: "Quand vendre plus cher",
          paragraphs: [
            "Les planchers sont un minimum, pas un objectif. Certains drops peuvent, et doivent, se vendre au-dessus.",
            "Montez le prix quand la pièce est limitée, comme une série de tournée ou d'anniversaire, quand le design a demandé un vrai travail ou qu'un collaborateur doit être payé, ou quand votre audience achète déjà plus cher ailleurs. Montez-le aussi si vous comptez faire de la pub : la dépense publicitaire sort de ces 10 $, donc un produit qui a besoin de portée payante a besoin de plus de marge.",
            "Restez près du plancher quand le but est la visibilité plutôt que le revenu : un premier drop, un petit article que les fans achètent sur un coup de cœur, ou une pièce que vous voulez voir portée à une rencontre. Même alors, ne descendez pas sous le plancher. Une vente qui laisse 3 $ ne vaut pas le service client qui va avec.",
            "Quoi que vous choisissiez, vérifiez les vrais chiffres de votre boutique. Taxes, livraison et frais varient selon le pays et la plateforme : appliquez la règle avec vos propres données.",
          ],
        },
        {
          heading: "Comment wovain l'applique pour vous",
          paragraphs: [
            "wovain applique exactement cette règle. Quand un design devient un produit, wovain lit le vrai coût de base du blank Fourthwall, puis fixe le plus petit prix en dollars ronds qui laisse à la fois 10 $ de profit et 30 % de marge après frais de carte, taxe de vente et réserve de 2 %. Prix, profit et marge s'affichent avec le produit : vous voyez le calcul, pas seulement le résultat.",
            "La règle est dans le code, pas dans un prompt : le pilote automatique ne peut pas la contourner. Les produits sont créés masqués, vous pouvez donc changer le prix dans Fourthwall avant de publier si vous voulez vous placer au-dessus du plancher.",
          ],
        },
      ],
      title:
        "Comment fixer le prix de votre merch print-on-demand pour gagner à chaque vente",
    },
  },
  integrations: {
    chatgpt: {
      category: "App de chat (serveur MCP)",
      connection: "yours",
      data: "ChatGPT envoie vos demandes aux outils de wovain. wovain utilise le même compte, les mêmes sessions et les mêmes connexions que le site : vous pouvez commencer un drop dans le chat et le finir sur le web.",
      description:
        "Ajoutez wovain à ChatGPT et lancez un drop de merch en langage courant : recherche, designs, produits Fourthwall et campagne Meta en pause, avec votre accord.",
      docsPath: "/docs/seller-guide",
      faq: [
        {
          answer:
            "Oui. Les mêmes agents, validations et règles tournent aux deux endroits, et les sessions lancées dans ChatGPT apparaissent dans votre historique sur le site.",
          question: "Est-ce la même chose que le site ?",
        },
        {
          answer:
            "Oui. Demandez une session avec le pilote automatique. Elle va jusqu'au produit publié et à la campagne en pause, avec les mêmes contrôles par le code que sur le web.",
          question: "Puis-je utiliser le pilote automatique depuis ChatGPT ?",
        },
        {
          answer:
            "Oui. ChatGPT vous donne un lien de connexion pour chacun, et vous autorisez votre propre boutique et votre propre compte publicitaire.",
          question: "Dois-je quand même connecter Fourthwall et Meta ?",
        },
      ],
      lead: "Si vous préparez déjà tout dans ChatGPT, vous pouvez y lancer votre drop aussi. wovain est un serveur MCP : ajoutez-le comme app, demandez un drop et dites oui à chaque étape.",
      name: "ChatGPT",
      related: ["creator-merch", "youtube-merch", "twitch-merch", "band-merch"],
      setup:
        "Dans ChatGPT, ouvrez Paramètres → Apps → Créer, collez https://mcp.wovain.com/api/mcp, puis connectez-vous à wovain et autorisez l'accès.",
      steps: [
        {
          body: "Dans ChatGPT, allez dans Paramètres → Apps → Créer et collez l'URL du serveur MCP, https://mcp.wovain.com/api/mcp.",
          title: "Ajouter wovain comme app",
        },
        {
          body: "ChatGPT ouvre la page de connexion de wovain. Une fois connecté, un écran de consentement vous demande d'autoriser ChatGPT à utiliser votre compte wovain.",
          title: "Se connecter et autoriser l'accès",
        },
        {
          body: "S'ils ne sont pas encore connectés, demandez à ChatGPT la liste de vos connexions. Il renvoie un lien pour chaque compte à autoriser.",
          title: "Connecter Fourthwall et Meta",
        },
        {
          body: "Dites ce que vous voulez en langage courant, par exemple « cherche des tendances pour du matériel de rando rétro ». ChatGPT lance la recherche et le premier design.",
          title: "Demander un drop",
        },
        {
          body: "ChatGPT vous demande votre accord avant de valider un design, de créer ou publier des produits, ou de monter la campagne. La campagne est toujours créée en pause.",
          title: "Valider chaque étape",
        },
      ],
      title:
        "wovain dans ChatGPT : préparer et lancer un drop de merch en discutant",
    },
    fourthwall: {
      category: "Boutique et catalogue print-on-demand",
      connection: "yours",
      data: "wovain lit les blanks du catalogue et leurs coûts de base, et envoie votre visuel validé, le titre, la description et le prix pour créer les produits dans votre boutique. L'autorisation Fourthwall est stockée scellée (chiffrée) et vous pouvez la déconnecter à tout moment dans Connexions.",
      description:
        "Connectez votre boutique Fourthwall : vos designs validés deviennent des produits sur de vrais blanks, avec 10 $ de profit par vente, masqués avant publication.",
      docsPath: "/docs/integrations/fourthwall",
      faq: [
        {
          answer:
            "Oui. wovain crée les produits dans la boutique que vous connectez : ils sont à vous dès le départ. Vous continuez à gérer la boutique dans Fourthwall comme d'habitude.",
          question: "Faut-il ma propre boutique Fourthwall ?",
        },
        {
          answer:
            "Non. Les produits sont créés masqués et passent en ligne quand vous les publiez. Seule exception : le pilote automatique, que vous activez vous-même pour une session.",
          question: "Les produits peuvent-ils être mis en ligne sans moi ?",
        },
        {
          answer:
            "À partir du coût de base du blank : au moins 10 $ de profit par vente et au moins 30 % de marge, selon ce qui donne le prix le plus haut, arrondi au dollar supérieur. Vous pouvez modifier le prix ensuite dans Fourthwall.",
          question: "Comment wovain fixe-t-il le prix ?",
        },
        {
          answer:
            "Non. Commandes, versements et messages clients restent dans votre boutique Fourthwall. wovain crée et publie seulement les produits.",
          question: "wovain gère-t-il mes commandes ?",
        },
      ],
      lead: "Fourthwall, c'est là que votre merch est mis en vente. wovain lit son catalogue pour connaître les vrais blanks et leurs coûts de base, puis transforme les designs que vous validez en produits dans votre propre boutique.",
      name: "Fourthwall",
      related: ["creator-merch", "youtube-merch", "twitch-merch", "band-merch"],
      setup:
        "Connectez-vous à wovain, ouvrez Connexions et autorisez votre propre boutique Fourthwall sur un seul écran de consentement.",
      steps: [
        {
          body: "wovain consulte les vrais blanks Fourthwall et leurs coûts de base : chaque prix, profit et marge affiché est un vrai chiffre, pas une estimation.",
          title: "Lire le catalogue",
        },
        {
          body: "Le prix part du coût de base du blank et laisse au moins 10 $ de profit et 30 % de marge après frais de carte, taxe de vente et réserve pour remboursements. Un blank à 12 $ se vend 24 $.",
          title: "Fixer le prix de chaque produit",
        },
        {
          body: "Votre visuel validé est envoyé et le produit est créé avec son titre, sa description et son prix. Il reste masqué : rien n'apparaît encore dans votre boutique.",
          title: "Créer le produit, masqué",
        },
        {
          body: "Vous vérifiez le produit et cliquez sur publier. C'est seulement là qu'il est en ligne. En pilote automatique, wovain publie pour vous une fois tous les contrôles passés.",
          title: "Publier quand vous le décidez",
        },
      ],
      title:
        "Fourthwall et wovain : du design validé au produit dans votre boutique",
    },
    meta: {
      category: "Compte publicitaire, Page et pixel",
      connection: "yours",
      data: "wovain envoie à votre compte publicitaire le texte des annonces, le lien du produit, les pays et le budget choisis pour créer la campagne. Il n'active jamais de dépense. L'autorisation Meta est stockée scellée (chiffrée) et vous pouvez la déconnecter à tout moment dans Connexions.",
      description:
        "wovain rédige jusqu'à trois variantes d'annonce Meta par produit et crée campagne, ensemble de publicités et annonces dans votre compte, le tout en pause.",
      docsPath: "/docs/integrations/meta-ads",
      faq: [
        {
          answer:
            "Non. Chaque campagne, ensemble de publicités et annonce est créé en pause, et wovain ne les active jamais. La dépense commence seulement quand vous lancez la campagne dans Meta.",
          question: "wovain peut-il dépenser mon budget pub ?",
        },
        {
          answer:
            "De 1 $ à 500 $ par jour. Commencer petit permet de voir quelle variante fait réagir avant de dépenser plus.",
          question: "Quel budget quotidien puis-je fixer ?",
        },
        {
          answer:
            "Jusqu'à trois variantes par produit, chacune sous un angle différent, avec une annonce par variante dans une seule campagne.",
          question: "Combien d'annonces wovain crée-t-il ?",
        },
        {
          answer:
            "Oui. Ce sont des objets normaux de votre compte : vous pouvez changer le texte, l'audience ou le budget dans le Gestionnaire de publicités avant de les lancer.",
          question: "Puis-je modifier les annonces avant leur diffusion ?",
        },
      ],
      lead: "Meta, c'est là que vos pubs tournent. wovain rédige les variantes et monte toute la campagne dans votre compte publicitaire, puis s'arrête : la campagne est créée en pause, et c'est vous qui décidez quand l'argent commence à partir.",
      name: "Meta",
      related: ["creator-merch", "youtube-merch", "twitch-merch", "band-merch"],
      setup:
        "Ouvrez Connexions dans wovain et autorisez votre propre compte publicitaire Meta, avec votre Page et votre pixel.",
      steps: [
        {
          body: "NVIDIA Nemotron rédige jusqu'à trois variantes par produit, chacune sous un angle différent, avec son titre et son message.",
          title: "Rédiger les variantes",
        },
        {
          body: "Vous choisissez où les pubs s'affichent et un budget quotidien entre 1 $ et 500 $. Vous pourrez changer les deux plus tard dans Meta.",
          title: "Choisir les pays et le budget",
        },
        {
          body: "wovain crée une campagne par produit, un ensemble de publicités et une annonce par variante dans votre compte. Tout est créé en pause.",
          title: "Créer la campagne, en pause",
        },
        {
          body: "Ouvrez la campagne dans le Gestionnaire de publicités Meta, vérifiez annonces, audience et budget, et lancez-la quand vous êtes prêt à dépenser.",
          title: "Vérifier et lancer dans Meta",
        },
      ],
      title:
        "Des pubs Meta pour votre merch, préparées pour vous et créées en pause",
    },
    nebius: {
      category: "Juge de design, rédacteur et pilote automatique",
      connection: "wovain",
      data: "wovain envoie à Nemotron l'idée, le brief, la fiche et des informations sur le visuel comme sa taille, et enregistre les réponses (verdicts, notes et raisons) sur votre design et votre session.",
      description:
        "NVIDIA Nemotron sur Nebius Token Factory rédige les fiches, juge chaque design, écrit les pubs et pilote l'automatique dans wovain, sous le contrôle du code.",
      docsPath: "/docs/integrations/nebius-nemotron",
      faq: [
        {
          answer:
            "Non. Le prix, la fourchette de budget de 1 $ à 500 $ et la campagne en pause sont imposés par le code. Nemotron rédige et juge ; il ne touche pas à ces règles.",
          question: "L'IA fixe-t-elle mes prix ?",
        },
        {
          answer:
            "Non. Si le juge dit « à revoir », le design n'est pas validé, quelle que soit la réponse du pilote automatique.",
          question:
            "Le pilote automatique peut-il valider un design signalé par le juge ?",
        },
        {
          answer:
            "NVIDIA Nemotron 3 Super, servi par Nebius Token Factory. Chaque réponse est vérifiée selon un format fixe avant que wovain ne l'utilise.",
          question: "De quel modèle s'agit-il ?",
        },
        {
          answer: "Non. Il tourne sur la clé de wovain.",
          question: "Faut-il un compte Nebius ?",
        },
      ],
      lead: "wovain confie à NVIDIA Nemotron, sur Nebius Token Factory, quatre petites tâches : rédiger le brief et la fiche, juger le design, écrire les pubs et décider en pilote automatique. Les règles strictes comme le prix et la taille d'impression restent dans le code.",
      name: "Nebius · NVIDIA Nemotron",
      related: ["creator-merch", "youtube-merch", "twitch-merch", "band-merch"],
      setup: "Rien à faire. Nemotron tourne sur la clé Nebius de wovain.",
      steps: [
        {
          body: "Nemotron transforme l'idée choisie en prompt de visuel, titre, description et couleurs de vêtement.",
          title: "Rédiger le brief et la fiche",
        },
        {
          body: "Il rend un verdict (prêt ou à revoir), une note sur 100, des contrôles sur le titre, la description, l'adéquation et l'originalité, et jusqu'à cinq corrections. Un visuel de moins de 2880 px de large échoue dans le code, quoi qu'en dise le modèle.",
          title: "Juger le design",
        },
        {
          body: "Il rédige jusqu'à trois variantes d'annonce, chacune avec un angle, un titre et un message.",
          title: "Écrire les pubs",
        },
        {
          body: "En pilote automatique, il choisit l'idée la plus prometteuse et valide ou refuse le design, avec une raison d'une ligne pour chaque choix. Un design signalé par le juge n'est jamais validé.",
          title: "Décider en pilote automatique",
        },
      ],
      title: "NVIDIA Nemotron sur Nebius : un second regard sur chaque design",
    },
    qloo: {
      category: "Graphe des goûts",
      connection: "wovain",
      data: "wovain envoie à Qloo le sujet de votre brief et reçoit des entités liées et des tags de goût. Rien de vos comptes Fourthwall ou Meta n'est envoyé à Qloo.",
      description:
        "wovain utilise le graphe des goûts de Qloo pour trouver les thèmes que vos fans aiment aussi, avant tout design. Il tourne sur sa clé : rien à configurer.",
      docsPath: "/docs/integrations/qloo",
      faq: [
        {
          answer:
            "Non. Qloo tourne sur la clé de wovain : vous écrivez seulement le brief.",
          question: "Faut-il un compte Qloo ?",
        },
        {
          answer:
            "Une carte de ce que les gens qui aiment une chose aiment aussi. Elle répond à la question qu'une courbe de tendance ne peut pas trancher : qu'est-ce que vos fans porteraient vraiment ?",
          question: "Qu'est-ce qu'un graphe des goûts ?",
        },
        {
          answer:
            "Ça aide. Les noms que Qloo a associés à votre sujet restent hors de l'impression. C'est une protection, pas un avis juridique, et vous validez toujours chaque design.",
          question: "Est-ce que ça m'évite les marques des autres ?",
        },
      ],
      lead: "La plupart des idées de merch partent de l'actualité. wovain part de votre audience : le graphe des goûts de Qloo montre quels thèmes les fans de votre sujet aiment aussi, et les designs en découlent.",
      name: "Qloo",
      related: ["creator-merch", "band-merch"],
      setup: "Rien à faire. Qloo tourne sur la clé de wovain.",
      steps: [
        {
          body: "Le sujet de votre brief, comme la niche d'une chaîne, un fandom ou un style, est rapproché de ce que Qloo connaît.",
          title: "Lire votre brief",
        },
        {
          body: "Qloo renvoie les goûts que partagent les fans de ces sujets en musique, cinéma, cuisine, voyage et plus. Ils deviennent les thèmes des idées.",
          title: "Trouver les thèmes de goût",
        },
        {
          body: "Les marques, artistes et titres que Qloo a associés à votre sujet sont enregistrés avec l'idée comme noms à ne jamais imprimer, et le brief de design les évite.",
          title: "Garder les noms hors de l'impression",
        },
        {
          body: "Tavily cherche ensuite l'actualité de la semaine et les annonces existantes dans ces thèmes : chaque idée a à la fois le goût et le bon moment derrière elle.",
          title: "Passer le relais à l'actualité",
        },
      ],
      title: "Qloo dans wovain : trouver ce que votre audience aime déjà",
    },
    tavily: {
      category: "Recherche d'actualité et d'annonces",
      connection: "wovain",
      data: "wovain envoie des requêtes construites à partir des thèmes de votre brief et garde les résultats avec leurs liens sources. Le texte du web est traité comme une donnée, jamais comme une instruction.",
      description:
        "wovain utilise Tavily pour lire l'actualité de la semaine de chaque idée de merch et compter les annonces similaires en ligne. Sources jointes, rien à régler.",
      docsPath: "/docs/integrations/tavily",
      faq: [
        {
          answer: "Non. Tavily tourne sur la clé de wovain.",
          question: "Faut-il un compte Tavily ?",
        },
        {
          answer:
            "Etsy, Redbubble et Fourthwall. Si beaucoup d'annonces ressemblent déjà à une idée, elle est moins bien notée.",
          question: "Quelles places de marché sont vérifiées ?",
        },
        {
          answer:
            "Oui. Chaque idée affiche ses sources : vous pouvez ouvrir l'actualité qui la justifie avant de choisir.",
          question: "Puis-je voir d'où vient une idée ?",
        },
      ],
      lead: "Une bonne idée au mauvais moment se vend mal. Tavily donne à chaque idée sa raison d'être maintenant, tirée de l'actualité de la semaine, et vérifie combien de boutiques vendent déjà quelque chose de proche.",
      name: "Tavily",
      related: ["creator-merch", "youtube-merch", "twitch-merch"],
      setup: "Rien à faire. Tavily tourne sur la clé de wovain.",
      steps: [
        {
          body: "Pour chaque thème de goût issu de Qloo, Tavily cherche dans l'actualité des sept derniers jours. Les résultats expliquent pourquoi l'idée tombe à pic, avec les liens.",
          title: "Chercher l'actualité de la semaine",
        },
        {
          body: "Tavily cherche des annonces similaires sur Etsy, Redbubble et Fourthwall. Moins il y en a, moins l'idée est encombrée, et mieux elle est notée.",
          title: "Vérifier les annonces",
        },
        {
          body: "Chaque idée garde ses liens sources : vous pouvez lire pourquoi elle est proposée avant de la choisir.",
          title: "Joindre les sources",
        },
      ],
      title:
        "Tavily dans wovain : l'actualité de la semaine et la concurrence en ligne",
    },
  },
};

export default content;
