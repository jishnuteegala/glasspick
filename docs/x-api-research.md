# X API research for entrant imports

Checked against official X documentation on 2026-07-22. X can change access, pricing, response behavior, and policy without notice; deployment decisions must use the current linked pages.

## Endpoints used

- [Get liking users](https://docs.x.com/x-api/posts/get-liking-users): `GET https://api.x.com/2/tweets/:id/liking_users`, with `max_results=100`. GlassPick intentionally imports only the first API page and marks likes limited. Official X pages conflict on app-only authentication for this endpoint, so operators may need a user-context access token.
- [Get reposting users API reference](https://developer.x.com/en/docs/twitter-api/tweets/retweets/api-reference/get-tweets-id-retweeted_by): `GET https://api.x.com/2/tweets/:id/retweeted_by`, paginated with `pagination_token` and at most 100 results per request.
- [Recent post search](https://docs.x.com/x-api/posts/search-recent-posts): `GET https://api.x.com/2/tweets/search/recent`, limited to the previous seven days. GlassPick searches by `conversation_id`, requests author expansion and reference fields, then retains only posts whose `replied_to` reference is the supplied post ID. This excludes nested replies and quotes.
- [Post lookup](https://docs.x.com/x-api/posts/lookup/introduction): `GET https://api.x.com/2/tweets/:id` with `tweet.fields=author_id,conversation_id`, `expansions=author_id`, and `user.fields=username`. Every import starts with this lookup: it confirms the post exists, verifies that the handle in the supplied URL matches the post author (case-insensitively) so receipts cannot misattribute a post to an unrelated handle, and supplies the `conversation_id` used for reply search.
- [Authentication overview](https://docs.x.com/fundamentals/authentication/overview): the Cloudflare Worker sends a server-side access token as a bearer credential. The token may be app-only or user-context depending on the endpoint access granted to the operator's X app.

## Operational constraints

- [Rate limits](https://docs.x.com/x-api/fundamentals/rate-limits): limits are per endpoint and authentication context; `429` responses include reset metadata. Rate limits and usage billing are separate.
- [Errors](https://docs.x.com/x-api/fundamentals/response-codes-and-errors): upstream errors must not be reflected verbatim because they can expose operational detail. GlassPick returns fixed, sanitized messages and partial-source notes.
- [X API overview and access](https://docs.x.com/x-api/getting-started/about-x-api): endpoint availability depends on the operator's current access and approved project.
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing): operators must check current usage-based pricing and configure caps or alerts; documentation and plans can change.

## Policy risk

- [Developer Policy](https://developer.x.com/en/developer-terms/policy) requires approved and accurately disclosed use, private credentials, respect for rate limits, privacy and account protections, content compliance, and restrictions on redistribution.
- The policy's **Pay to engage** section says services may not sell or receive monetary or virtual compensation for X actions including likes, reposts, comments, and replies. Giveaway mechanics can create material policy risk and need operator review or written guidance from X.
- [Developer Agreement](https://developer.x.com/en/developer-terms/agreement) and [Restricted uses](https://developer.x.com/en/developer-terms/more-on-restricted-use-cases) also apply. The importer does not make write actions, cache API responses server-side, or claim that results are complete.

GlassPick records only the final handles once the organiser loads and commits them. The preview explicitly distinguishes fetched totals, deduplication, known unavailable records, source completion, and hard limitations. Those disclosures do not make an incomplete source complete or prove participant eligibility.
