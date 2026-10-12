import { MIRA, VIEWER, cookUri, rk } from "../support/fixtures";
import { expect, stubWrite, test } from "../support/signedIn";

// The cook page: photos, kudos, comments, deleting (Phase 6.7 suite).

const ribs = `/cook/${MIRA.did}/${rk("ribs")}`;

test("shows the photo, note, badge, kudos and comments", async ({ page }) => {
  await page.goto(ribs);
  await expect(page.getByRole("heading", { name: "Braised short ribs" })).toBeVisible();
  const photo = page.getByRole("img", { name: "Braised short ribs (illustration)" });
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("Low and slow, four hours.")).toBeVisible();
  await expect(page.getByTestId("best-badge")).toHaveText("Best dinner, Jun 2025");
  await expect(page.getByTestId("kudos-count")).toHaveText("2 kudos");
  await expect(page.getByText("Looks amazing!")).toBeVisible();
  await expect(page.getByText("Recipe please?")).toBeVisible();
});

test("kudos toggle", async ({ page }) => {
  const log = await stubWrite(page, "POST", "/api/kudos", () => ({ json: {}, delay: 300 }));
  await page.goto(ribs);
  await page.getByRole("button", { name: "Give kudos" }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Kudos given" })).toBeVisible();
  await expect(page.getByTestId("kudos-count")).toHaveText("3 kudos");
  expect(log[0].body).toMatchObject({ cook: cookUri(MIRA.did, rk("ribs")) });
});

test("posting a comment: failure keeps the text, success adds it", async ({ page }) => {
  const log = await stubWrite(page, "POST", "/api/comment", (body, n) =>
    n === 1
      ? { status: 502, json: { error: "down" } }
      : {
          json: {
            uri: `at://${VIEWER.did}/com.example.cooklog.comment/${rk("cnew")}`,
            author: { did: VIEWER.did, handle: VIEWER.handle, displayName: VIEWER.name, avatarCid: null },
            text: body.text as string,
            sortAt: new Date().toISOString(),
          },
        },
  );
  await page.goto(ribs);
  const box = page.getByPlaceholder("Add a comment");
  await box.fill("How long did you brown them?");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByRole("form", { name: "Add a comment" }).getByRole("alert")).toHaveText("Couldn't post your comment. Try again.");
  await expect(box).toHaveValue("How long did you brown them?");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("How long did you brown them?")).toBeVisible();
  await expect(box).toHaveValue("");
  expect(log.map((l) => (l.body as { rkey: string }).rkey)).toEqual([expect.any(String), (log[0].body as { rkey: string }).rkey]);
});

test("deleting your comment asks first", async ({ page }) => {
  const log = await stubWrite(page, "DELETE", "/api/comment", () => ({ json: { deleted: "x" } }));
  await page.goto(ribs);
  // Only your own comment has a delete button.
  await expect(page.getByRole("button", { name: "Delete comment" })).toHaveCount(1);
  await page.getByRole("button", { name: "Delete comment" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Recipe please?")).toHaveCount(0);
  expect(log[0].body).toEqual({ uri: `at://${VIEWER.did}/com.example.cooklog.comment/${rk("c1")}` });
});

test("deleting your own cook asks first, then goes to your profile", async ({ page }) => {
  const log = await stubWrite(page, "DELETE", "/api/cook", () => ({ json: { deleted: "x" } }));
  await page.goto(`/cook/${VIEWER.did}/${rk("dal")}`);
  await page.getByRole("button", { name: "Delete cook" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delete this cook?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(log).toHaveLength(0);
  await page.getByRole("button", { name: "Delete cook" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(`/profile/${VIEWER.handle}`);
  expect(log[0].body).toEqual({ rkey: rk("dal") });
});

test("someone else's cook has no delete button", async ({ page }) => {
  await page.goto(ribs);
  await expect(page.getByRole("heading", { name: "Braised short ribs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete cook" })).toHaveCount(0);
});

test("not found: an unknown cook, an unknown profile, an unknown page", async ({ page }) => {
  for (const url of [`/cook/${MIRA.did}/${rk("nope")}`, "/profile/nobody.e2e.test", "/no-such-page"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  }
});
