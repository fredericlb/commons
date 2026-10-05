# `UserMenu` — the account, the other apps, the logout

`@frediverse/ui/user-menu` is the button at the far right of an app's header: a menu headed by
the signed-in account's email, then one row per OTHER application the host wants to offer, then
the logout.

```tsx
<AppHeader
  title="pl8"
  actions={
    <UserMenu
      email={user.email}
      onLogout={() => void auth.logout()}
      links={[{ id: "k7", label: "k7", hint: "the recorder", icon: Mic, href: k7Url }]}
    />
  }
/>
```

## What the host keeps

The email is handed in rather than fetched here: every host already asked who is signed in to
get past its own gate, and where that question is asked — same origin, another origin with
credentials, a native bridge — is the host's. The logout is the host's for the same reason, and
because where to land afterwards is the host's to say: a reload onto the sign-in screen, or
another page altogether.

The links are the host's too: which applications exist and where each one answers is a
deployment fact, and this package knows no deployment.

## A new tab

The rows are plain `<a href>` carrying `target="_blank"`. They are other **applications**, not
other pages of this one: what you were doing is what you come back to, and leaving in place would
lose more than the scroll position — a playing `<audio>`, an unsaved buffer. It is also what a
desktop shell needs: `target="_blank"` is what it turns into opening the system browser.

`asChild` matters: the row *is* the anchor, so ctrl-click, middle-click and "copy link address"
all mean what they say — a menu item that merely *called* `window.open` would answer all three
the same way, which is to say wrongly.

`rel="noopener"` severs `window.opener`: nothing here reaches back into the tab it came from.

## `notice`, the day there is nowhere to go

A host that knows its links would all fail — a desktop app paired with no server — passes
`notice` instead: one disabled row carrying the sentence that names the fix, while the account
and the logout stay. A menu of links at a 503 would be as many ways to find that out the hard way.

## Props

| prop | what |
| --- | --- |
| `email` | the menu's heading; `null` while not known yet |
| `onLogout` | ends the session |
| `links` | `{ id, label, hint?, icon?, href }[]`, each opened in a new tab |
| `notice` | said in place of the links |
| `label`, `logoutLabel` | the trigger's name and the logout row's, English by default |
