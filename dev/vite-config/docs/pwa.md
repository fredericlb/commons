# Le service worker que chaque app reçoit

`defineAppConfig` ajoute `vite-plugin-pwa` à toute app du frediverse. Ce qu'il achète est une
**seconde ouverture** — le shell et ses assets sont précachés, donc l'app démarre du disque au
lieu de retélécharger son bundle — et l'**installabilité** : sans worker, aucun navigateur ne
propose d'ajouter l'app à un écran d'accueil.

Il n'achète pas le hors-ligne, et ce n'est pas un oubli. Ces apps lisent leur état d'un backend ;
un shell en cache sans backend derrière ne peut que dessiner l'erreur qu'il dessine déjà.

## Ce que l'app doit fournir

Le preset ne génère **pas** de manifeste (`manifest: false`). Le nom, les icônes et le `start_url`
sont l'identité de l'app, pas celle d'un préréglage — et st0 en porte deux, qu'il échange selon la
page (`apps/st0/frontend/docs/external.md`). Une app veut donc :

- `public/manifest.webmanifest`, avec des URLs **relatives** : un manifeste résout ses adresses
  contre la sienne, pas contre celle du document, donc un `/…` absolu échappe à l'app dès qu'elle
  est montée sous un préfixe ;
- des icônes 192 et 512 en PNG, aux dimensions qu'elles déclarent — un navigateur refuse en
  silence si l'en-tête du fichier ne correspond pas ;
- `<link rel="manifest">` dans son `index.html` ;
- l'enregistrement, chez elle :

```ts
if ("serviceWorker" in navigator)
  void import("virtual:pwa-register").then(({ registerSW }) =>
    registerSW({ immediate: true }),
  );
```

`injectRegister: null` est délibéré : un `<script>` injecté par le plugin poserait cette décision
hors du fichier qui décide de tout le reste du document.

## Le scope, et pourquoi une seule app a besoin de `pwaDenylist`

Le scope d'un worker est le dossier d'où il a été servi, et c'est un **préfixe** : il n'existe
aucun moyen de dire « tout sauf `/pl8` ».

Une app montée sous un `base` ne contrôle donc que son propre préfixe, et n'a rien à déclarer.
Une app servie à la **racine de l'origine** contrôle tout, ses voisines comprises — et si sa
`navigateFallback` répond à leurs navigations, elles servent son shell : une page blanche avec
son routeur qui refuse une adresse qu'il ne sait pas lire.

D'où `pwaDenylist`, que seule l'app racine passe. Dans studio c'est st0 :

```ts
pwaDenylist: [/^\/(pl8|k7|z0|api|auth)(\/|$)/],
```

C'est la même table que le `nginx.conf` de l'image. Deux copies du même fait, et celle-ci est
celle qu'un navigateur applique — **à vérifier en premier** si une app voisine sert un jour le
shell de l'app racine.

## `registerType: "prompt"`, et rien n'invite

`autoUpdate` pose `skipWaiting` + `clientsClaim`, donc un nouveau worker prend la main sur un
onglet déjà ouvert. Deux conséquences, mauvaises toutes les deux : la page peut se recharger au
milieu de ce qu'on faisait, et surtout un shell du build A continue de tourner alors que le
précache est celui du build B — le prochain chunk chargé paresseusement est un fichier haché qui
n'existe plus.

`prompt` laisse le nouveau worker **en attente** jusqu'à ce que tous les onglets de l'origine
soient fermés, le seul moment où l'échange ne coûte rien. Rien n'invite à recharger, faute d'une
formulation honnête : elle devrait dire « fermez tous les onglets de ce domaine ».

## `clientsClaim` en dev seulement

Un navigateur ne propose l'installation qu'une fois qu'un worker **contrôle** la page. Sans
`clients.claim()`, la première visite en enregistre un qui ne contrôle rien : l'affordance
n'apparaît qu'à la **deuxième** navigation.

Sur un poste on recharge machinalement et personne ne le remarque. Sur une tablette, non — et
c'est l'appareil pour lequel une PWA existe. En dev il n'y a pas d'assets hachés, donc rien à
désynchroniser : le claim y est gratuit. En build il reste éteint, pour la raison ci-dessus.

`IS_BUILD` se lit sur la ligne de commande parce que `defineAppConfig` rend un objet et n'offre
pas de `({ command })` à capturer.

## `devOptions.enabled: true`

Sinon il n'y a **aucun** worker en dev, et le navigateur ne propose jamais l'installation — alors
que le manifeste, les icônes et HTTPS sont tous en place, donc tout a l'air prêt. La seule chose
que ce plugin sert à faire n'était testable que dans un build.

Le worker de dev ne précache rien (il n'y a pas d'assets hachés avant un build) et Workbox y
restreint son fallback de navigation à `/` seul, donc les URLs de modules de Vite passent à côté.

## Quand `pwa: false`

Pour une app qui n'est pas un écran : un outil interne servi dans une iframe, une page qu'on ne
veut pas voir proposée à l'installation. Ce n'est pas le cas courant — le défaut est qu'une app
du frediverse s'installe.

## Le piège qui a coûté le plus de temps

Une page HTTPS qui charge la moindre ressource en clair est signalée « inclut des ressources qui
ne sont pas sécurisées », et **cela suffit à la rendre non installable**. Le certificat peut être
parfait, le manifeste complet, les icônes valides : rien n'y fait.

Chercher côté certificat est le réflexe, et c'est une impasse. Le panneau d'informations du site
distingue les deux : un problème de certificat le dit ; du contenu mixte dit « ressources non
sécurisées ». Lire cette ligne d'abord épargne une heure.
