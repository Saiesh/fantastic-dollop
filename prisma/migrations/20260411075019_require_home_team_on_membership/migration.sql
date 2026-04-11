/*
  Warnings:

  - Made the column `home_team_id` on table `group_memberships` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "group_memberships" DROP CONSTRAINT "group_memberships_home_team_id_fkey";

-- Why: Legacy memberships may lack a home team; assign the first roster team so NOT NULL can apply.
UPDATE "group_memberships" AS gm
SET "home_team_id" = (
  SELECT lt."team_id"
  FROM "league_teams" AS lt
  WHERE lt."league_id" = gm."league_id"
  ORDER BY lt."team_id"
  LIMIT 1
)
WHERE gm."home_team_id" IS NULL;

-- AlterTable
ALTER TABLE "group_memberships" ALTER COLUMN "home_team_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
