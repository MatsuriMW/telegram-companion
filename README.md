# Telegram Companion

[Getting started guide](docs/getting-started.md) · [中文说明](README.zh-CN.md) · [上手指南](docs/上手指南.md)

**Contents**

- Start here: [What it does](#what-it-does) · [Screenshots](#screenshots) · [Installation](#installation) · [Requirements](#requirements)
- Using it: [Setup](#usage) · [Two modes](#two-modes) · [Commands](#commands) · [Custom commands](#custom-commands) · [Tasks](#tasks) · [Persona, catchphrases and the profile note](#persona-catchphrases-and-the-profile-note)
- How it remembers: [Memory](#memory) · [What goes into each reply](#what-goes-into-each-reply) · [What it does not remember](#what-it-does-not-remember)
- Setup and extras: [Model backends](#model-backends) · [Works with Nautilus Spiral](#works-with-nautilus-spiral) · [Network use, accounts and local programs](#network-use-accounts-and-local-programs)
- More: [Feedback and updates](#feedback-and-updates) · [Credits and license](#credits-and-license)

A Telegram bot for your Obsidian vault that does two things. Everything you send it lands in today's daily note, and when you want to talk, it answers as a friend who has read your recent notes. It keeps a small profile note about you that grows over time, and you choose which model sits behind it: Claude Code CLI, the Anthropic API, or any OpenAI-compatible endpoint, including a local Ollama.

It is a modified version of the community plugin [Telegram Inbox](https://github.com/icealtria/obsidian-telegram-inbox), which saves messages sent to your own Telegram bot into your daily note. This version adds a character on the other end of the inbox who has read your notes. It can see what you are doing today, what you have been busy with all week and what you plan to do next. So when you say "I'm exhausted" it does not answer with a generic "hang in there", and when you say "done!" it knows what you finished.

The settings and the bot's built-in messages follow Obsidian's language (Chinese or English). The language of the model's replies is a separate setting, English by default.

## What it does

| Your situation | What it does |
|---|---|
| An idea arrives and only your phone is at hand | Send it to the bot in Telegram. Text, photos and links go straight into today's daily note |
| You want to talk, but an AI chat needs you to explain what you have been doing first | It reads the last week of your daily notes before answering |
| AI chats repeat themselves after a while | It remembers what it said recently and does not bring the same thing up again |
| Every AI has the same customer-service voice | The default persona is warm and on your side. You can write a note that makes it play someone else, and teach it your own catchphrases |
| It forgets what you told it last time | After a chat it writes new facts into a profile note, and rewrites the recent part every week. Long-term traits are only added after you approve them |
| You want to know what you did today | Say "睡了" (going to sleep) and it replies with a summary: what got done, what to start with tomorrow |
| You do not want to be tied to one model provider | Switch between Claude Code CLI, the Anthropic API and OpenAI-compatible endpoints at any time. With a local Ollama, your notes never leave your computer |

## Screenshots

<p>
  <img src="docs/images/chat-en.jpg" width="340" alt="Chat mode: asked for praise, it praises the things recorded in that day's daily note">
  <img src="docs/images/spiral-en.jpg" width="340" alt="Scheduled push: today's spiral schedule and what to do next">
</p>

**Left: chat mode.** The message was "Praise me! Look how much I got done today, and I sprained my ankle." Everything it praises is in that day's daily note: finishing the backlinks panel and shipping it at 4 a.m., working on a résumé, updating a skill, an hour of ball. It got the order of the sprain and the research backwards, corrected itself when told, and asked whether it still hurts to stand on.

**Right: used together with [Nautilus Spiral](https://github.com/MatsuriMW/nautilus-spiral).** At a few fixed times a day it sends today's spiral to your phone: how much of the day is gone, how much time is left, whether the to-dos still fit, and what to do next.

Both are real conversations from the author's own use, originally in Chinese and translated here ([original screenshots](README.zh-CN.md#用起来是什么样)). The model replies in the language set under **Reply language**; the Nautilus Spiral push is currently in Chinese only.

## Installation

Desktop only. The bot runs inside Obsidian on your computer, so Obsidian has to be open for it to answer. Messages sent while the computer was asleep are picked up when it wakes.

- From the community plugin directory: open **Settings → Community plugins → Browse**, search for "Telegram Companion", then install and enable it.
- Manually: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/MatsuriMW/telegram-companion/releases/latest) into `<your vault>/.obsidian/plugins/telegram-companion/`, then enable the plugin under **Settings → Community plugins**.

## Usage

1. In Telegram, message `@BotFather`, send `/newbot`, and copy the token it gives you.
2. Open the plugin settings. A **Getting started** checklist at the top ticks off each step as you do it. Paste the token into **Bot token**; the checklist shows the bot's name once it is connected.
3. **Pair**: the checklist shows a 6-digit code. Open your bot in Telegram, tap Start and send it the code. Your account is then on the allowlist, and only accounts on the allowlist are answered. You can also type Telegram usernames (without `@`) or numeric IDs into the allowlist yourself.
4. Send the bot any text, photo or link. It is written into today's daily note. The folder and date format follow the Daily notes core plugin (or Periodic Notes).
5. For the companion part, pick a backend in the **Model** section (see [Model backends](#model-backends)). The test button in that section confirms the connection.
6. Send `/chat` to start talking and `/record` to go back to capturing. `/help` lists every command.

### Two modes

- **Record mode** (default): whatever you send is saved, as in the original inbox.
- **Chat mode**: it answers every message, following the conversation. Chat messages are not written to the daily note.

Chat mode starts only when you clearly want to talk:

- **Send `/chat`, or a message that is just a chat phrase.** The default phrases are "chat mode", "let's talk", "let's chat", "I want to ask you" and "can I ask you" (with Obsidian in Chinese: 对话模式, 让我们来对话吧, 对话一下, 我想问你, 问你个事, 陪我聊聊 and a few more). It stays on until you send `/record`.
- **Start a message with a chat phrase**, e.g. "I want to ask you: what should I start with tomorrow?". It answers that message right away.
- **Reply to one of its messages.**
- **Send a catchphrase that has *Then chat* turned on** (the default greeting has it on).

Edit the phrases under **Phrases that start chat mode** in the settings. Symbols of your own work too: add `??` and send `?? what did I do this week`. Moods do not start chat mode: "so tired" or "nailed it" is saved like any other message, and once you are in chat mode it answers in the matching tone. A chat that started any way other than a whole phrase or `/chat` returns to record mode after 20 minutes of silence (configurable) and tells you so.

### Commands

| You send | It does | Saved to the daily note |
|---|---|---|
| Any text, photo, link or voice message | Saves it to today's daily note, timed by when the message was sent. With list mode on, each line becomes a list item; lines that already are list items (`•`, `1、`, `①` and the like) keep their own marker and indentation, and a `#` heading becomes an item with everything under it indented one level (`##` one level deeper). Optionally the first line gets the time it arrived, forwarded messages get a tag, and pictures are embedded at a percentage of their own width | Yes |
| `/chat`, `/record` | Enters or leaves chat mode | No |
| `/summary` | Summarises today without ending the day | No |
| `/mode` | Says which mode it is in | No |
| `/model` | Shows the current model, with buttons to switch | No |
| `/persona` | Shows the current persona, with buttons to switch | No |
| `/me` | Shows what it currently knows about you | No |
| `/profile` | Re-reads this week's notes and updates the profile | Updates the profile note |
| `/task text` | Adds a to-do | Yes |
| `/help` | Lists the commands, your own included | No |
| Your own triggers | Whatever you set them to do, see [Custom commands](#custom-commands) | Depends |

Most commands also have a Chinese phrase (for example "对话模式" for `/chat`, "睡了" to end the day and get the summary). The full list is in the [Chinese README](README.zh-CN.md).

### Custom commands

The built-in phrases are fixed, such as `?` for today's schedule. Under **Custom commands** in the settings you pick your own triggers (a word, a few letters or a symbol: `!`, `zz`, `idea`, `/idea`) and what each one does:

| Kind | What happens | Example |
|---|---|---|
| Same as a built-in command | A message that is just the trigger does what that command does | `zz` ends the day with the summary; `sched` shows today's spiral schedule |
| Save to a note | The text after the trigger is written to a note, in a format you choose. With no note set, it goes where messages are normally saved (today's daily note) | Trigger `idea`, note `Ideas.md`, format `- {{time}} {{text}}`: sending `idea podcast about sleep` adds `- 14:05 podcast about sleep` to `Ideas.md` |
| Ask the model | It answers a prompt you wrote, with your profile note and the last week of daily notes at hand. The message is not saved | Trigger `recap`, prompt "From today's note, list what I got done and give me a first step for tomorrow" |

- A trigger made of letters or Chinese characters needs a space or a colon before the text (`idea: text`). A trigger that ends in a symbol can be followed directly (`!buy milk`).
- In the format, `{{text}}` is the text, `{{time}}` the time the message was sent and `{{date}}` its date. `- [ ] {{text}}` makes a to-do. In a prompt, `{{text}}` is the text after the trigger; without it, the text is added after the prompt.
- A trigger that starts with `/` and uses only lowercase letters, digits and underscores (`/idea`) also shows up in Telegram's `/` menu. `/help` lists your commands at the end.
- Custom commands are checked before the built-in phrases, in both modes.
- Ask the model uses the backend chosen under Model, so it works with your own API key, DeepSeek included (see [Model backends](#model-backends)).

### Tasks

Tasks in your daily note can be Markdown checkboxes (`- [ ]`, `- [/]`, `- [x]`) or keywords (`- TODO`, `- DOING`, `- DONE`). It reads both.

### Persona, catchphrases and the profile note

- **Persona**: by default it is a caring character who is on your side and does not nag. Turn on the persona setting to make it follow a note you write instead: who it is, what it calls you, how long its replies are. Point the setting at a folder to keep several personas and switch between them with `/persona`.
- **Catchphrases**: greetings and thanks do not need a model. For each trigger word you choose an instant reply: a greeting that mentions what you are doing, an echo, or a random line from a list you wrote.
- **Profile note**: one note in your vault that describes you. You write the long-term part. A section at the end is maintained automatically: updated after a chat in which you said enough, and rewritten every Sunday. Changes to the part you wrote are sent to Telegram with approve / reject buttons and are only applied when you approve.

Rules that hold whatever the persona or profile says: it responds only to your own affairs and does not apply other people's words quoted in your notes to you; it brings up self-harm resources only when you explicitly say you want to hurt yourself in the current conversation; and when the model cannot be reached, it says so right away.

A persona also gets a few red lines that come before anything the persona note says: every character is an adult (18 or older) and is not played childlike; it can be sweet and flirty but never sexually explicit; it does not make money, medical, legal or safety decisions for you, only points out the risks; and it does not play a character that manipulates you or encourages harm. These are instructions to the model, so they are not guaranteed. The one check the plugin does itself: a persona note that states an age under 18 or says the character is a minor is not used, and the default persona answers instead.

## Memory

The bot remembers you in four layers: the higher, the more stable; the lower, the shorter-lived. Your daily notes are not one of them. They are your own record, which it reads before replying but never edits.

| Layer | Where it lives | How it gets written | How long it lasts |
|---|---|---|---|
| Long-term profile | The sections you wrote at the top of the profile note | You write it. The bot can only suggest additions; nothing is written until you tap ✅ | Until you change it |
| Recently | The "🔄 Recently" section at the end of the profile note | After a chat in which you said at least 150 characters, new facts are merged in; the whole section is rewritten every Sunday | Rewritten weekly |
| This week's chats | The plugin's own data file (`data.json`), never your notes | Everything you say in chat mode | Marked once merged; cleared after the Sunday update |
| This conversation | Memory only | The last 16 messages (about 8 exchanges) | Cleared when you leave chat mode or switch persona |

It also keeps the replies it sent in the last 24 hours (up to 30), only so it does not repeat the same point or the same praise. They are cleared when you switch persona.

Send `/me` to see what it currently knows about you, or `/profile` to update the profile from this week's notes right away.

### What goes into each reply

In chat mode, every reply hands the model:

1. **The whole profile note**: your long-term profile plus "🔄 Recently".
2. **A digest of the last week of daily notes**: today in the most detail (up to 120 lines), the two days before at 50 lines each, the four days before that at 30 lines each. Only task lines and top-level entries; indented children, images and anything past 140 characters are left out.
3. **Feeling lines from the last month**: short lines (60 characters or less) such as "so tired" or "so happy", searched back 30 days from yesterday, up to 12, so it knows when you last felt low or good.
4. **Sleep and workout data**, when Nautilus Spiral or the task reminder plugin is installed.
5. **This conversation**, plus anything it said in the last 24 hours that is not already in it.

### What it does not remember

- **Chat transcripts do not outlive the week**: they are deleted after the Sunday update, leaving only the summary in "Recently". This is a privacy choice; the cost is that it forgets the details of a chat from a month ago.
- **It does not search the whole vault**: it reads only the fixed windows above. Something from more than a month ago is remembered only if it is in the profile note. Feeling lines are found by keywords, not by meaning.
- **Not recorded as facts**: small talk, pure feeling lines, and other people's words, quotes and excerpts in your notes.
- **Conflicts**: there is no dedicated merge or forgetting rule. The Sunday rewrite of "Recently" goes by that week's notes; it never edits the part you wrote, so remove anything outdated yourself.

## Model backends

Chat replies, summaries and profile updates call a large language model. Choose one backend in the settings:

| Backend | What you need | Good for |
|---|---|---|
| Claude Code CLI | [Claude Code](https://claude.com/claude-code) installed and logged in on this computer; no key | People with a Claude subscription |
| Anthropic API | An API key and a model name | Paying per use for Claude |
| OpenAI-compatible endpoint | A base URL, a key and a model name. DeepSeek, OpenAI, OpenRouter and a local Ollama all work | Other providers, or keeping data on your computer with Ollama |

You can fill in all three and switch at any time, in the settings or by sending `/model` in Telegram.

**Using your own DeepSeek key.** Choose OpenAI-compatible endpoint, pick DeepSeek in the address dropdown, paste your key and enter the model name from DeepSeek's docs. Press the test button to check. Other providers with an OpenAI-compatible API work the same way with their own address.

**Fallback backend.** Pick a second backend under Fallback backend (备用后端) and fill in its settings right below it, and the bot keeps answering when the first one fails, for example when a subscription's usage limit is reached, a request times out, or a login expires. The failed request is retried once on the fallback, and the reply ends with a line saying which model answered and why the first one did not. For the next 10 minutes requests go straight to the fallback, then the first backend is tried again. For example, use the Claude Code CLI as the backend and, as the fallback, OpenAI-compatible with DeepSeek picked as the address, plus a DeepSeek key and model name.

**Where your data goes.** For each reply the plugin sends your profile note, the persona note and a digest of the last week of daily notes (task lines and top-level items, no attachments) to the model service you chose (or to the fallback backend, when one is set and it answered), and to no one else. API keys are stored in the plugin's own `data.json`. If your vault is synced to a public place, exclude that file.

## Works with Nautilus Spiral

The plugin works on its own. Together with [Nautilus Spiral](https://github.com/MatsuriMW/nautilus-spiral), a plugin by the same author that draws today's events and to-dos as a spiral schedule, it does more:

- Send `?` to get today's spiral and what is next.
- "起了" (got up) and "睡了" (going to sleep) mark the start and end of the day.
- "去吃饭了" (going to eat), "去锻炼了" (going to work out) and "午睡" (nap) pause the timers of running tasks. Saying you are back resumes them.
- `done 写稿 2h` and `doing 写稿` update the matching task in today's note (this one also needs the done-to-top plugin).

Without these plugins the phrases above are saved like any other message, and everything else works the same.

## Network use, accounts and local programs

- **Network**
  - Telegram Bot API (`api.telegram.org`): receives the messages you send to the bot, sends replies, and downloads photos and files from messages.
  - The model service you chose: `api.anthropic.com` for the Anthropic API, or the base URL you entered for an OpenAI-compatible endpoint. With a local Ollama nothing leaves your computer. If a fallback backend is set, the same content goes to that service instead when the first backend fails.
  - Nothing else. There are no analytics and no telemetry.
- **Accounts**: a Telegram account to create the bot. The companion features need an account or API key for a model service, or a local Ollama. Using it only as an inbox needs no model.
- **Local programs**: with the Claude Code CLI backend, the plugin starts the `claude` program installed on your computer to generate replies, using that program's own login. Other backends start no programs.
- **Files outside the vault**: none are read or written.

## Requirements

- Your own Telegram bot (free, from @BotFather).
- Daily notes: it reads Obsidian's daily notes, following the Daily notes core plugin or Periodic Notes. It reads top-level lines and task lines; indented detail below them is not read.
- A model backend for the companion features.
- Obsidian on desktop, running.

It is not therapy and does not replace the people around you.

## Feedback and updates

To follow new features, send feedback or keep up with progress, follow me on Twitter: [@Matsurimywaifu](https://x.com/Matsurimywaifu).

## Credits and license

Based on the community plugin [Telegram Inbox](https://github.com/icealtria/obsidian-telegram-inbox) by [icealtria](https://github.com/icealtria). The original inbox, media download and message templates are kept. This version adds the two modes, the companion, personas, catchphrases, the profile note and the switchable model backends. The source changes are in this repository's commit history. The original is released under GPL-3.0, and so is this version: [GPL-3.0](LICENSE).
