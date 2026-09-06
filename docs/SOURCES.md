# References

Reddit Toolbox uses no third-party runtime code or assets. These projects informed its behavior:

- **[Shreddit by Andrew Banchich](https://github.com/andrewbanchich/shreddit/tree/8b14b04ce522658dea918127a8d2cc4370037f14)** — archive discovery, selection review, exclusions, and preserving comments when archive score data is missing. Reviewed at revision 8b14b04; [MIT license](https://github.com/andrewbanchich/shreddit/blob/8b14b04ce522658dea918127a8d2cc4370037f14/LICENSE), copyright 2023 Andrew Banchich. Its Rust implementation and credential setup are not included.
- **Insta Toolbox DM Unsend** — the floating launcher, movable panel, resize controls, and single-start batch interaction. The Reddit window controller is implemented in this repository.
- **[Reddit's archived deletion handler](https://github.com/reddit-archive/reddit/blob/master/r2/r2/controllers/api.py)** — historical context for deletion acknowledgements and no-op responses. Current responses are checked independently; archived source is not a current endpoint contract.

No third-party logos, copied source, or bundled binaries are distributed. See [session access](API_ACCESS.md) for the current request model and pacing references.
