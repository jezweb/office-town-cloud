# Variant 2 — Multi-file output prompt

Asks the AI to produce ~10 separate markdown files in one response, each as a fenced code block. Cleaner for routing (each block maps directly to one cortex file). Slightly more demanding on the AI — works best with Claude or Gemini 3+.

**Paste everything below into your existing AI:**

---

I'm setting up a new AI working environment called Office Town. It's a personal cortex that gets populated with structured markdown files about me, my work, my business, and the people I work with. The structure is fixed; the content I need from you.

Please produce the following files. Each file as a separate fenced code block tagged `markdown`. Put the filename in an HTML comment at the top of each block so I can split them apart easily.

Draw on what you've actually observed in our prior conversations — don't be generic. If you're uncertain about something, say so in the file itself (e.g. "I'm not sure but I think..."). If you genuinely don't have enough data on a topic, write a short file noting "unclear, needs interview" rather than making things up.

Produce these 10 files:

1. **bio.md** — Who I am: name, role, location, personality, how I introduce myself
2. **voice.md** — How I talk: tone, register, words I use, words I avoid, per-channel variation, things I push back on
3. **rhythm.md** — My week + working hours + when I'm most productive + what drains me
4. **expertise.md** — Domains I'm deep in + topics I know unusually well
5. **opinions.md** — Strong views I hold (technical, business, philosophical) + things I prefer + things I reject
6. **values.md** — What matters most + lines I don't cross + lines I push others not to cross
7. **vocabulary.md** — Words/phrases I use frequently + words I avoid + technical jargon I default to
8. **business.md** — Business name, sector, services, scale, current strategic direction, key clients I've mentioned
9. **people.md** — Team members + contractors + family + key external contacts I've mentioned by name, with how each relates to me
10. **projects.md** — What I'm actively working on, status, blockers, adjacent projects

Format example for each file:

````markdown
<!-- bio.md -->
[your detailed content here, 200-500 words]
````

Length per file: 200-500 words each. Write detailed paragraphs with specific examples from our actual conversations where possible. Going long is better than going short — these files will populate a wiki that future AI agents read to understand me, so depth matters.

After the 10 files, add one final file:

````markdown
<!-- unclear.md -->
[topics or sections where you guessed because you don't have enough data; things you'd want to ask me about]
````

Begin.
