import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Member } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { X, YoutubeIcon } from "lucide-react";
import iconChzzk from "@/assets/icon_chzzk.png";

export const Route = createFileRoute("/profile/$code")({
  component: ProfilePage,
});

function ProfilePage() {
  const { code } = Route.useParams();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMember() {
      try {
        const response = await fetch(`/api/members/${code}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Member not found");
          }
          throw new Error("Failed to fetch member");
        }
        const data = await response.json();
        setMember(data as Member);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchMember();
  }, [code]);

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="container mx-auto p-4 text-center text-red-500">
        {error || "Member not found"}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <Card
        className="overflow-hidden"
        style={{ borderColor: member.main_color || undefined }}
      >
        <div
          className="h-32 w-full"
          style={{
            backgroundColor: member.main_color || "#ccc",
            backgroundImage: member.sub_color
              ? `linear-gradient(to bottom right, ${member.main_color}, ${member.sub_color})`
              : undefined,
          }}
        />
        <CardHeader className="relative pt-0">
          <div
            className="absolute -top-16 left-6 h-32 w-32 rounded-full border-4 border-background bg-muted flex items-center justify-center text-4xl shadow-lg"
            style={{ backgroundColor: member.sub_color || "#eee" }}
          >
            {member.oshi_mark || "👤"}
          </div>
          <div className="mt-16 ml-2">
            <CardTitle className="text-3xl font-bold flex items-center gap-2">
              {member.name}
              <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {member.code}
              </span>
            </CardTitle>
            <p className="text-muted-foreground">
              {member.unit_name} / {member.fan_name}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground">
                Birth Date
              </h3>
              <p>{member.birth_date || "Unknown"}</p>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground">
                Debut Date
              </h3>
              <p>{member.debut_date || "Unknown"}</p>
            </div>
          </div>

          <div className="flex gap-4">
            {member.url_twitter && (
              <Button asChild variant="outline" size="icon">
                <a
                  href={member.url_twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Twitter"
                >
                  <X className="h-5 w-5" />
                </a>
              </Button>
            )}
            {member.url_youtube && (
              <Button asChild variant="outline" size="icon">
                <a
                  href={member.url_youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="YouTube"
                >
                  <YoutubeIcon className="h-5 w-5" />
                </a>
              </Button>
            )}
            {member.url_chzzk && (
              <Button asChild variant="outline" size="icon">
                <a
                  href={member.url_chzzk}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Chzzk"
                >
                  <img src={iconChzzk} alt="Chzzk" />
                </a>
              </Button>
            )}
          </div>

          {member.is_deprecated === "1" && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
              This member profile is deprecated.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
