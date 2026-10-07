const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const { COMMUNITY_COMMENT_FIELDS } = require('../src/modules/community/community-comment.model');
const { COMMUNITY_POST_FIELDS } = require('../src/modules/community/community-post.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.communityPosts, COMMUNITY_POST_FIELDS);
  await ensureSheetWithHeader(env.googleSheets.sheets.communityComments, COMMUNITY_COMMENT_FIELDS);
  console.log(`Community sheets are ready: ${env.googleSheets.sheets.communityPosts}, ${env.googleSheets.sheets.communityComments}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
