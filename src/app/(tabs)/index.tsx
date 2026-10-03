import { ArticleList } from "@/components/article-list";

export default function LatestScreen() {
    return (
        <ArticleList
            title="Latest"
            baseFilter={{}}
            showCategories
            showUnreadToggle
            showMarkAllRead
            emptyMessage="No articles yet. Add a feed or import your OPML from the Feeds tab, then pull to refresh."
        />
    );
}
