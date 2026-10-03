import { ArticleList } from "@/components/article-list";

export default function SavedScreen() {
    return (
        <ArticleList
            title="Saved"
            baseFilter={{}}
            modes={[
                {
                    key: "bookmarks",
                    label: "Bookmarks",
                    filter: { bookmarkedOnly: true },
                },
                {
                    key: "favorites",
                    label: "Favourites",
                    filter: { favoritesOnly: true },
                },
            ]}
            emptyMessage="Nothing saved yet. Bookmark or favourite an article while reading and it will show up here."
        />
    );
}
