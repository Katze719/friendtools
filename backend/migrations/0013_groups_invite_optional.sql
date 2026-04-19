-- Invite codes become optional and on-demand.
--
-- Previously every group carried a permanent invite_code from the moment it
-- was created. Owners now explicitly "open" a group to generate a code and
-- can "close" it again (wiping the code) so nobody can join. Reopening
-- generates a fresh code so old shared links/QRs stop working.
--
-- Existing groups keep their current code so in-flight invites don't break.

ALTER TABLE groups
    ALTER COLUMN invite_code DROP NOT NULL;
