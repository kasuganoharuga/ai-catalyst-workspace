## Summary

-

## Test Plan

- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] FastAPI smoke check, if API code changed
- [ ] Docker Compose config check, if infrastructure changed

## Notes

- V1 keeps Next.js as the primary full-stack application.
- FastAPI is reserved for future AI workflow execution.
- No production secrets or cloud credentials should be added to this repository.
