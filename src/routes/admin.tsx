import { isAdminUser, getAdminIds } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  PlusCircle,
  Pencil,
  Trash2,
  ExternalLink,
  Megaphone,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { type Notice } from "@/db/schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: RouteComponent,
});

const noticeTypeConfigs = {
  notice: {
    label: "공지사항",
    badgeClass: "bg-primary text-primary-foreground",
  },
  event: {
    label: "이벤트",
    badgeClass: "bg-secondary text-secondary-foreground",
  },
} as const;

type NoticeTypeKey = keyof typeof noticeTypeConfigs;

interface NoticeFormValues {
  id?: number;
  content: string;
  url: string;
  type: NoticeTypeKey;
  started_at: string;
  ended_at: string;
  is_active: boolean;
}

function RouteComponent() {
  const { isLoaded, isSignedIn, user } = useUser();
  const adminIds = getAdminIds();
  const authorized = isAdminUser(user?.id);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editNoticeId, setEditNoticeId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<NoticeFormValues>({
    defaultValues: {
      content: "",
      url: "",
      type: "notice",
      started_at: "",
      ended_at: "",
      is_active: true,
    },
  });

  const loadNotices = useCallback(async () => {
    setIsFetching(true);
    try {
      const response = await fetch("/api/notices?includeInactive=1");
      if (!response.ok) throw new Error("Failed to load notices");
      const data = await response.json();
      setNotices(data);
    } catch (error) {
      console.error("Failed to load notices:", error);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) {
      void loadNotices();
    }
  }, [authorized, loadNotices]);

  const onSubmit = async (data: NoticeFormValues) => {
    setIsSaving(true);
    try {
      const payload = {
        ...data,
        is_active: data.is_active ? "1" : "0",
        url: data.url || undefined,
        started_at: data.started_at || undefined,
        ended_at: data.ended_at || undefined,
      };

      const response = await fetch("/api/notices", {
        method: editNoticeId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editNoticeId ? { ...payload, id: editNoticeId } : payload
        ),
      });

      if (!response.ok) throw new Error("Failed to save notice");

      await loadNotices();
      reset();
      setEditNoticeId(null);
    } catch (error) {
      console.error("Failed to save notice:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (notice: Notice) => {
    setEditNoticeId(notice.id ?? null);
    setValue("content", notice.content ?? "");
    setValue("url", notice.url ?? "");
    setValue("type", (notice.type as NoticeTypeKey) ?? "notice");
    setValue("started_at", notice.started_at ?? "");
    setValue("ended_at", notice.ended_at ?? "");
    setValue("is_active", notice.is_active !== "0");
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("정말로 이 공지사항을 삭제하시겠습니까?")) return;
    try {
      const response = await fetch(`/api/notices?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      await loadNotices();
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex w-full justify-center px-4 py-10">
        <Card className="w-full max-w-xl">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
            <div>
              <CardTitle>로그인이 필요합니다</CardTitle>
              <CardDescription>관리자 전용 페이지입니다.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex gap-3">
            <SignInButton>
              <Button className="rounded-full">로그인</Button>
            </SignInButton>
            <Link to="/">
              <Button variant="ghost" className="rounded-full">
                홈으로
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex w-full justify-center px-4 py-10">
        <Card className="w-full max-w-xl">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <div>
              <CardTitle>접근 권한이 없습니다</CardTitle>
              <CardDescription>
                관리자 권한이 있는 계정으로 로그인해주세요.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              현재 계정 ID:{" "}
              <code className="bg-muted px-1 rounded">{user.id}</code>
            </p>
            <div className="text-xs text-muted-foreground">
              허용된 관리자 ID: {adminIds.join(", ") || "없음"}
            </div>
            <Link to="/">
              <Button variant="ghost" className="rounded-full self-start">
                홈으로
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">관리자 센터</h1>
            <p className="text-muted-foreground">
              공지사항 및 시스템 설정을 관리합니다.
            </p>
          </div>
        </div>
        <Link to="/">
          <Button variant="outline" className="rounded-full">
            사이트로 돌아가기
          </Button>
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* Notice List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              공지사항 목록
            </h2>
            {isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="grid gap-3">
            {notices.length === 0 && !isFetching && (
              <p className="text-center py-10 text-muted-foreground border rounded-xl border-dashed">
                등록된 공지사항이 없습니다.
              </p>
            )}
            {notices.map((notice) => (
              <Card
                key={notice.id}
                className={cn(
                  "overflow-hidden",
                  notice.is_active === "0" && "opacity-60 grayscale"
                )}
              >
                <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          noticeTypeConfigs[notice.type as NoticeTypeKey]
                            ?.badgeClass ?? "bg-muted"
                        )}
                      >
                        {noticeTypeConfigs[notice.type as NoticeTypeKey]
                          ?.label ?? notice.type}
                      </span>
                      {notice.is_active === "0" && (
                        <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-medium">
                          비활성
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-relaxed">
                      {notice.content}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {notice.url && (
                        <a
                          href={notice.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> 링크
                        </a>
                      )}
                      {notice.started_at && (
                        <span>시작: {notice.started_at}</span>
                      )}
                      {notice.ended_at && <span>종료: {notice.ended_at}</span>}
                    </div>
                  </div>
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-3"
                      onClick={() => handleEdit(notice)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> 수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(notice.id!)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> 삭제
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Notice Form */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {editNoticeId ? (
              <Pencil className="h-5 w-5" />
            ) : (
              <PlusCircle className="h-5 w-5" />
            )}
            {editNoticeId ? "공지사항 수정" : "새 공지사항 등록"}
          </h2>

          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <Field>
                  <FieldLabel>내용</FieldLabel>
                  <FieldContent>
                    <Textarea
                      placeholder="공지 내용을 입력하세요"
                      className="min-h-[100px]"
                      {...register("content", {
                        required: "내용을 입력해주세요",
                      })}
                    />
                    <FieldError errors={[errors.content]} />
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel>링크 URL (선택)</FieldLabel>
                  <FieldContent>
                    <Input placeholder="https://..." {...register("url")} />
                    <FieldError errors={[errors.url]} />
                  </FieldContent>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel>유형</FieldLabel>
                    <FieldContent>
                      <Controller
                        name="type"
                        control={control}
                        render={({ field }) => (
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(noticeTypeConfigs).map(
                                ([key, config]) => (
                                  <SelectItem key={key} value={key}>
                                    {config.label}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FieldContent>
                  </Field>

                  <Field className="flex-row items-center justify-between gap-2">
                    <FieldLabel className="mb-0">노출 여부</FieldLabel>
                    <Controller
                      name="is_active"
                      control={control}
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      )}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel>시작일</FieldLabel>
                    <FieldContent>
                      <Input type="date" {...register("started_at")} />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel>종료일</FieldLabel>
                    <FieldContent>
                      <Input type="date" {...register("ended_at")} />
                    </FieldContent>
                  </Field>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1" disabled={isSaving}>
                    {isSaving && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    {editNoticeId ? "수정 완료" : "등록하기"}
                  </Button>
                  {editNoticeId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditNoticeId(null);
                        reset();
                      }}
                    >
                      취소
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
