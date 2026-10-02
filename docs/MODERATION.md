# Moderation: where reports go and what to do with them

Players can report another player (Friends → the ⚑ next to a name), a study-buddy listing or a public group (⚑ in Discover, which is hidden for now), and a card (a flag on the card). There is no chat and no free text beyond display names and group names, so the things to review are names.

## Where to read them

One list holds everything, newest first. In Supabase open **SQL editor** and run:

```sql
SELECT * FROM moderation_queue LIMIT 50;
```

(or open `moderation_queue` in the Table editor). Columns: `source` (player, card, buddy or group), `created_at`, who reported (`reporter_name`), what was reported (`target_id`, `target_name`), and the reason. Players cannot read this list.

Set a reminder to look once a week at first. Supabase can also email you: Database → Webhooks is not needed for this scale.

## What to do

- **Offensive display name:** rename it, or hide the profile. Run
  `UPDATE player_profiles SET player_name = 'Player', visible = false WHERE user_id = '<target_id>';`
- **Abusive player:** remove them entirely: Supabase → Authentication → Users → the user → Delete user (deletes their data too). Look the id up with `SELECT id, email FROM auth.users WHERE id = '<target_id>';`
- **Offensive group name or public group:** `UPDATE study_groups SET visibility = 'private', name = 'Study group' WHERE id = '<target_id>';`
- **Wrong card:** fix it in `js/cards/` and ship an update; card reports are tied to a card id.
- **Spam of reports:** each player can send at most 20 reports a day.

Keep a note of what you did in a spreadsheet; the stores ask for a moderation process in their review forms ("users can report content, reports are reviewed, abusive accounts are removed"), and this is it.

## Crash reports

Anonymous crash and slow-frame reports (only from players who switched them on) are in `client_diagnostics`: `SELECT message, system, operation, version, count(*) FROM client_diagnostics GROUP BY 1,2,3,4 ORDER BY 5 DESC;`
