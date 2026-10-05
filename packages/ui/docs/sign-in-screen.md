# `SignInScreen` — every app's signed-out page, over the starfield

`@frediverse/ui/sign-in-screen` is the whole page a visitor sees before they
are signed in: a card centred over `Starfield` (`@frediverse/ui/starfield`),
with the app's name, one line of what to do, and the action.

```tsx
<SignInScreen
  title="phare"
  description="Sign in with your frediverse account."
  footer={<LocalePicker {...useLocale()} />}
>
  <Button asChild className="w-full">
    <a href={api.loginUrl}>
      <FrediverseMark size="sm" /> Sign in
    </a>
  </Button>
</SignInScreen>
```

## What counts as a sign-in screen

Anything a visitor meets **before** the app is theirs: the sign-in itself,
an invitation's registration form, a native app's "which server, which
account" setup, the "server unreachable, retry" card a gate shows when it
cannot tell. They all use this component, so they all have the stars: one
first impression across the frediverse. The starfield is not a prop.

Not one: the vault passphrase prompt, or anything else drawn **inside** the
app shell, under its header. The starfield is `fixed inset-0` and would sit
behind the bar.

## Props

| prop | what |
| --- | --- |
| `title` | the app's name, or what the screen is for |
| `description` | one line under it |
| `children` | the action: a button, a form, a retry |
| `footer` | under the card, over the stars, in light text: a language picker |
| `wordmark` | "frediverse" across the top in white brand type (the `font-palette-white` utility) — for a screen about the network itself, like registration |
| `className` | on the card: `text-center`, a wider `max-w-lg` |

The card stays the regular `Card`, light or dark with the theme. The stars
are always night: the canvas paints its own sky.
