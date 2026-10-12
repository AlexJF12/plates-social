import { VIEWER, rk } from "../support/fixtures";
import { expect, stubWrite, test } from "../support/signedIn";

// Logging a cook, with the upload and the record write stubbed.

test("validation, upload progress, a failed post keeps the form, the retry posts", async ({ page }) => {
  const blobs = await stubWrite(page, "POST", "/api/blob", () => ({
    json: {
      blob: { $type: "blob", ref: { $link: "bafkreie2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e" }, mimeType: "image/jpeg", size: 1000 },
      width: 1600,
      height: 1200,
    },
    delay: 400,
  }));
  const posts = await stubWrite(page, "POST", "/api/cook", (_, n) =>
    n === 1 ? { status: 502, json: { error: "Posting to your PDS failed" } } : { json: { uri: `at://${VIEWER.did}/com.example.cooklog.cook/${rk("new")}`, cid: "x" } },
  );
  await page.goto("/log");
  const submit = page.getByRole("button", { name: "Post cook" });
  await expect(submit).toBeDisabled();

  await page.locator('input[type="file"]').setInputFiles(process.env.E2E_PHOTO!);
  await expect(page.getByRole("button", { name: "Remove photo 1" })).toBeVisible();
  await expect(submit).toBeDisabled(); // no dish yet
  await page.getByPlaceholder("What did you cook?").fill("Paella");
  await page.getByRole("button", { name: "Dinner" }).click();
  await page.getByPlaceholder("How did it turn out? What would you change?").fill("Crispy socarrat.");
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(page.getByRole("button", { name: /Uploading photo 1 of 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByText("Posting to your PDS failed")).toBeVisible();
  await expect(page.getByPlaceholder("What did you cook?")).toHaveValue("Paella");

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page).toHaveURL(`/cook/${VIEWER.did}/${rk("new")}`);
  // The photo was uploaded once; both posts used the same rkey.
  expect(blobs).toHaveLength(1);
  expect(posts.map((p) => p.body)).toEqual([
    expect.objectContaining({ dishName: "Paella", mealType: "dinner", note: "Crispy socarrat.", rkey: expect.any(String) }),
    expect.objectContaining({ rkey: (posts[0].body as { rkey: string }).rkey }),
  ]);
  const images = (posts[0].body as { images: { width: number; height: number }[] }).images;
  expect(images).toEqual([expect.objectContaining({ width: 1600, height: 1200 })]);
});
