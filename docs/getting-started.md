# Getting started

From nothing to "send *I want to ask you: what have I been busy with?*, get a reply that has read your daily notes" in about 15 minutes. After the first three steps you have a working inbox; the rest sets up the companion.

The settings tab has a **Getting started** checklist at the top that ticks off each step as you do it, so you can also just follow that.

## Step 1: Create your own Telegram bot

1. In Telegram, search for `@BotFather` and send `/newbot`.
2. Pick a display name, then a username that ends in `bot`.
3. BotFather replies with a **token** like `1234567890:AA…`. It works like the bot's password, so don't share it.

## Step 2: Install the plugin, paste the token, pair

1. In Obsidian, open **Settings → Community plugins → Browse**, search for Telegram Companion, install and enable it.
2. Open the plugin settings. The **Getting started** checklist is at the top.
3. **Bot token**: paste the token from step 1. Step 1 of the checklist changes to `Bot connected: @yourbot` once it is connected.
4. **Pair**: step 2 of the checklist shows a 6-digit code. Open your bot in Telegram, tap Start and send it the code. When it answers "Paired", your account is on the allowlist. Only accounts on the allowlist are answered; anyone else who messages your bot gets no reaction at all.

The code only works while the allowlist is empty, and it stops working after a few wrong guesses; press **New code** to get another. You can also type Telegram usernames (without `@`) or numeric IDs into **Allowlist** yourself, separated by commas.

Where daily notes live and how they are named follows the **Daily notes** core plugin (or Periodic Notes), so make sure it is turned on and has a folder and date format set.

## Step 3: Send your first message

Send the bot "test".

- A ❤️ reaction on your message means it was received.
- Open today's daily note: the message is there.

The inbox is ready. A few settings worth knowing:

- **Day starts at**: night owls can set `04:00` so late-night messages go into the previous day's note.
- **Insert after a heading**: put messages after a given heading or line instead of at the end of the note.
- **Download pictures and files**: save pictures into the vault and embed them in the note.

## Step 4: Pick a model backend

The companion needs a model. Scroll down to the **Model** section and choose one of three:

**A. Claude CLI** (easiest if you already pay for Claude)

1. Install [Claude Code](https://claude.com/claude-code), run `claude` once in a terminal and log in.
2. Set **Backend** to **Claude CLI**. The path defaults to `~/.local/bin/claude`; run `which claude` in a terminal if you're not sure.
3. Leave the model on default, or pick sonnet / opus / haiku.

**B. Anthropic API**

Set **Backend** to **Anthropic API** and fill in an API key and model name.

**C. OpenAI-compatible** (DeepSeek, OpenAI, OpenRouter, local Ollama…)

1. Set **Backend** to **OpenAI-compatible**.
2. Pick a common API address from the dropdown on the right, or type your own, up to `/v1`.
3. Fill in the key (can be empty for a local Ollama) and the model name from that service's docs.

Then press **Send a test**. "… answered: received" means it works. If it says "… failed", the text after it is the reason; common ones are at the end of this guide.

Replies are written in the language under **Reply language** (English by default).

## Step 5: Write your profile note

1. In the settings, **Profile note** holds a path (default `Companion profile.md`). Press **New template** next to it.
2. Open the note. Everything under **Basics** (what to call you, gender, age, education, MBTI, job, what you care about lately) is optional: leave out whatever you don't want to say. In the other sections, replace the hints in parentheses with your own situation. You don't have to fill it all in at once; the most useful section to start with is **When you answer me**: how you like to be answered, and what kind of reply annoys you most.
3. The more concrete it is, the more the replies sound like someone who knows you. Quoting your own daily notes works best.

You can chat without a profile; it then answers in a default way (meet the feeling first, use facts from your notes, no lecturing).

## Step 6: Have a chat

Try these in Telegram:

| Send | You should see |
|---|---|
| `hello` | An instant greeting that mentions what you're doing today (this is a default catchphrase; see the next step to add your own) |
| `/chat` | "💬 Chat mode on" |
| A few messages, e.g. "what have I been busy with this week?" | First "💭 Got it, thinking…", then after a few seconds a real reply that draws on this week's notes |
| `/record` | "📝 Back in record mode" |
| `/summary` | What you got done today, and which thing to start with tomorrow |
| `/model` | The model in use, with buttons to switch |

Starting a message with a chat phrase ("I want to ask you: …", "let's talk …") or replying to one of its messages also starts chat mode; after a while of silence it goes back to recording on its own. Moods such as "so tired" or "nailed it" do not start it and are saved as usual. The phrases are under **Phrases that start chat mode** in the settings, and you can add symbols of your own.

If you said enough in a chat, a little after it ends you get "🧩 I noted a few things from our chat", saying what it added to the **Recently** section of your profile. If it got something wrong, edit the note.

## Step 7 (optional): Teach it your catchphrases

The **Catchphrases** section in the settings holds how you usually say hi and what you say when you're happy. Add a trigger word and pick how it answers (greeting / echo / a random line from your list). For example, trigger "woo", answer "Echo", with **Happy** on: send "woo woo" and it answers "woowoowoo!".

## Step 8 (optional): Give it a persona

By default it is a warm, caring character who is on your side. To have it play someone else:

1. Turn on **Play a character** and press **New template** next to **Persona note**.
2. In that note, describe who the character is, how they talk, what they call you and how replies are formatted.
3. For several characters, point **Persona note** at a folder with one note per character, and switch with `/persona` in Telegram.

A few red lines hold whatever the note says: every character is an adult, nothing sexually explicit, no money, medical or legal decisions made for you, and no character that manipulates you.

## Step 9 (optional): Let it reach out

- Every Sunday evening it rewrites **Recently** and sends it to you; change the time under **Keeping the profile up to date**.
- To have it read weekly reviews or project retros too, add their paths to **Extra notes for the weekly update**, one per line. For a folder, the note whose name sorts last is used.
- For scheduled pushes of your day and reminders about things you keep putting off, install the same author's Nautilus Spiral and task-reminder plugins; they send through the same bot. (Their messages are currently in Chinese.)

## Troubleshooting

**I send messages and nothing happens**
Obsidian has to be open and the computer awake. Check that step 1 of the checklist says the bot is connected (otherwise check the token), and that step 2 says you are paired.

**I can't see the plugin in Obsidian on my phone**
It only runs on desktop. You don't need it on the phone: you message the bot, Obsidian on your computer writes it into the daily note, and sync brings it to your phone.

**"failed: Not logged in" or 403**
The CLI backend uses `claude`'s own login. Run `claude auth logout`, then `claude auth login` in a terminal.

**"failed: Model API 401 / 404"**
401 means the key is wrong. 404 usually means the API address has a part too many or too few (it should end at `/v1`), or the model name is misspelled.

**It keeps bringing up the same thing**
It avoids what it said in the last day, but if your notes only mention one thing lately, there's not much else to talk about. Write a bit more, or add "don't keep bringing up X" under **When you answer me** in your profile.

**I don't want it to remember what I say**
Turn off **Use what you said in chat mode**. What has been kept is cleared after the next weekly update; you can also delete `chatMemory` from the plugin's `data.json`.

**The interface is in Chinese**
The settings and the bot's fixed messages follow Obsidian's language: Chinese when Obsidian is in Chinese, English otherwise. The language of the model's replies is the separate **Reply language** setting.
