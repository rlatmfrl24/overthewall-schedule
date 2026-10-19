// @vitest-environment jsdom
import React, { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/test/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { createAdminCatalogFixture } from "../../test/catalog-fixtures";
import { SongConnectionPicker } from "./song-connection-picker";
import { SubjectPicker } from "./catalog-entry-dialog";

const fetchCatalog = vi.hoisted(() => vi.fn());
vi.mock("../../api/admin", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/admin")>(),
  fetchOtwPlayAdminCatalog: fetchCatalog,
}));
afterEach(cleanup);
beforeEach(() => { fetchCatalog.mockReset(); });

const song = {
  id: "remote-song", slug: "remote-song", title: "Remote song", normalizedTitle: "remote song",
  isOtwOriginal: false, originalReleaseDate: null, originalReleasePrecision: "unknown" as const,
  archivedAt: null, version: 0, aliases: [], tags: [], originalArtists: [],
};

it("refreshes off-page song results through catalog invalidation", async () => {
  const client = createTestQueryClient();
  fetchCatalog.mockResolvedValue(createAdminCatalogFixture({ songs: [song] }));
  render(<QueryClientProvider client={client}><SongConnectionPicker inputKey="test" catalog={createAdminCatalogFixture({ paged: true })}
    selectedSongId="" query="Remote" onQueryChange={vi.fn()} onSelectExisting={vi.fn()} /></QueryClientProvider>);
  fireEvent.focus(screen.getByRole("combobox"));
  await screen.findByRole("option", { name: /Remote song/ });
  fetchCatalog.mockResolvedValue(createAdminCatalogFixture());
  await act(() => client.invalidateQueries({ queryKey: queryKeys.otwPlay.adminCatalog() }));
  await waitFor(() => expect(screen.queryByRole("option", { name: /Remote song/ })).toBeNull());
});

it("refreshes off-page identities through catalog invalidation", async () => {
  const client = createTestQueryClient();
  fetchCatalog.mockResolvedValue(createAdminCatalogFixture({ entities: [{
    id: "remote-person", memberUid: null, entityKind: "person", displayName: "Remote person",
    normalizedName: "remote person", slug: "remote-person", archivedAt: null, version: 0,
  }] }));
  render(createElement(QueryClientProvider, { client }, createElement(SubjectPicker, {
    remote: true, label: "참여자", members: [], entities: [], selected: [], onChange: vi.fn(),
  })));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Remote" } });
  await screen.findByRole("option", { name: /Remote person/ });
  fetchCatalog.mockResolvedValue(createAdminCatalogFixture());
  await act(() => client.invalidateQueries({ queryKey: queryKeys.otwPlay.adminCatalog() }));
  await waitFor(() => expect(screen.queryByRole("option", { name: /Remote person/ })).toBeNull());
});

it("waits for remote identity checking before offering a new song", () => {
  fetchCatalog.mockReturnValue(new Promise(() => {}));
  const client = createTestQueryClient();
  render(<QueryClientProvider client={client}><SongConnectionPicker inputKey="new" catalog={createAdminCatalogFixture({ paged: true })}
    selectedSongId="" query="Remote song" onQueryChange={vi.fn()} onSelectExisting={vi.fn()} onSelectNew={vi.fn()} /></QueryClientProvider>);
  fireEvent.focus(screen.getByRole("combobox"));
  expect(screen.queryByRole("option", { name: /새 곡 입력/ })).toBeNull();
});

it("does not offer a new song when an exact identity is beyond the lookup page", async () => {
  fetchCatalog.mockResolvedValue({ ...createAdminCatalogFixture(), exactSongExists: true });
  const client = createTestQueryClient();
  render(<QueryClientProvider client={client}><SongConnectionPicker inputKey="exact" catalog={createAdminCatalogFixture({ paged: true })}
    selectedSongId="" query="Star" onQueryChange={vi.fn()} onSelectExisting={vi.fn()} onSelectNew={vi.fn()} /></QueryClientProvider>);
  fireEvent.focus(screen.getByRole("combobox"));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.queryByRole("option", { name: /새 곡 입력/ })).toBeNull();
});

it("uses a newer search row without letting it override a later archived catalog row", async () => {
  const client = createTestQueryClient();
  fetchCatalog.mockResolvedValue(createAdminCatalogFixture({ songs: [{ ...song, title: "Remote renamed", version: 1 }] }));
  const props = { inputKey: "versions", selectedSongId: "", query: "Remote", onQueryChange: vi.fn(), onSelectExisting: vi.fn() };
  const catalog = createAdminCatalogFixture({ paged: true, songs: [song] });
  const view = render(<QueryClientProvider client={client}><SongConnectionPicker {...props} catalog={catalog} /></QueryClientProvider>);
  fireEvent.focus(screen.getByRole("combobox"));
  await screen.findByRole("option", { name: /Remote renamed/ });
  view.rerender(<QueryClientProvider client={client}><SongConnectionPicker {...props}
    catalog={{ ...catalog, revision: 8, songs: [{ ...song, archivedAt: 1, version: 2 }] }} /></QueryClientProvider>);
  expect(screen.queryByRole("option")).toBeNull();
});

it("reaches song matches beyond the first lookup page", async () => {
  fetchCatalog.mockImplementation(async query => createAdminCatalogFixture({
    paged: true, nextCursor: query.cursor ? null : "next",
    songs: [{ ...song, id: query.cursor ? "last" : "first", title: query.cursor ? "Star" : "A Star" }],
  }));
  const client = createTestQueryClient();
  render(<QueryClientProvider client={client}><SongConnectionPicker inputKey="pages" catalog={createAdminCatalogFixture({ paged: true })}
    selectedSongId="" query="Star" onQueryChange={vi.fn()} onSelectExisting={vi.fn()} /></QueryClientProvider>);
  fireEvent.focus(screen.getByRole("combobox"));
  await screen.findByRole("option", { name: /A Star/ });
  fireEvent.click(screen.getByRole("button", { name: "검색 결과 더 보기" }));
  await screen.findByRole("option", { name: /^Star/ });
  expect(fetchCatalog).toHaveBeenCalledWith(expect.objectContaining({ cursor: "next", limit: 25 }));
});

it("hides the previous query's next page while a new lookup is waiting", async () => {
  fetchCatalog.mockResolvedValue(createAdminCatalogFixture({ paged: true, nextCursor: "old-query", songs: [song] }));
  const client = createTestQueryClient();
  const props = { inputKey: "debounce", selectedSongId: "", onQueryChange: vi.fn(), onSelectExisting: vi.fn(), catalog: createAdminCatalogFixture({ paged: true }) };
  const view = render(<QueryClientProvider client={client}><SongConnectionPicker {...props} query="Remote" /></QueryClientProvider>);
  fireEvent.focus(screen.getByRole("combobox"));
  await screen.findByRole("button", { name: "검색 결과 더 보기" });
  view.rerender(<QueryClientProvider client={client}><SongConnectionPicker {...props} query="Different" /></QueryClientProvider>);
  expect(screen.queryByRole("button", { name: "검색 결과 더 보기" })).toBeNull();
  expect(fetchCatalog).toHaveBeenCalledTimes(1);
});
