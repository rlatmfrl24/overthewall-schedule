import type { ReactNode } from "react";
import { getSiteCopyrightNotice } from "@/shared/lib/site-rights";
import { ContentPageShell } from "@/shared/ui/content-page-shell";

const linkClassName =
  "font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground";

export function RightsPage() {
  return (
    <ContentPageShell
      title="저작권 및 권리 안내"
      contentClassName="max-w-4xl gap-0 pb-12 pt-6 sm:pt-7"
    >
      <section
        className="space-y-4 pb-7"
        aria-labelledby="rights-introduction"
      >
        <h2 id="rights-introduction" className="text-lg font-semibold sm:text-xl">
          운영 주체와 안내 범위
        </h2>
        <div className="space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
          <p>
            OTW Schedule은 팬이 운영하는 비공식 정보 사이트이며, 오버더월,
            소속사 또는 외부 플랫폼의 공식 서비스가 아닙니다.
          </p>
          <p>
            {getSiteCopyrightNotice()} 이 고지는 사이트 운영자가 직접 제작한
            UI, 설명 문구와 편집물에만 적용됩니다. 제3자의 콘텐츠, 상표 또는
            그 밖의 권리까지 사이트가 소유한다는 뜻이 아닙니다.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          최종 업데이트: 2026년 8월 19일
        </p>
      </section>

      <RightsSection id="rights-categories" title="권리의 구분">
        <dl className="divide-y divide-border/70 border-y border-border/70">
          <RightsDefinition term="사이트 자체 제작물">
            별도 출처나 라이선스가 표시되지 않은 UI, 설명 문구와 편집물의
            저작권은 사이트 운영자에게 있습니다.
          </RightsDefinition>
          <RightsDefinition term="제3자 콘텐츠 및 상표">
            멤버의 이름·활동명·초상과 프로필, 로고, 영상, 음악, 클립, 썸네일,
            게시물, 서비스 명칭 및 상표에 관한 저작권·상표권과 그 밖의 권리는
            각 권리자에게 있습니다.
          </RightsDefinition>
          <RightsDefinition term="별도 표기가 있는 자료">
            개별 콘텐츠에 출처, 이용 조건 또는 라이선스가 표시된 경우 해당
            표시가 우선 적용됩니다.
          </RightsDefinition>
        </dl>
      </RightsSection>

      <RightsSection id="external-content" title="외부 콘텐츠 사용 범위">
        <div className="space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
          <p>
            이 사이트는 공개된 일정 정보와 콘텐츠를 찾기 쉽게 정리하고, 원본
            링크·메타데이터 또는 플랫폼이 제공하는 임베드 방식으로 표시할 수
            있습니다.
          </p>
          <p>
            사이트에 표시되었다는 사실만으로 원본 콘텐츠의 소유권이 이전되거나
            복제·재배포·2차적 이용이 허락되지는 않습니다. 원본을 별도로
            이용하려면 해당 권리자의 허락, 적용 라이선스와 플랫폼 약관을
            확인해야 합니다.
          </p>
        </div>
      </RightsSection>

      <RightsSection id="rights-contact" title="권리 침해 및 정정 요청">
        <div className="space-y-4 text-sm leading-7 text-muted-foreground sm:text-base">
          <p>
            권리 침해, 잘못된 출처 또는 콘텐츠 정정·제한·삭제가 필요한 경우
            아래 정보를{" "}
            <a className={linkClassName} href="mailto:397love@gmail.com">
              397love@gmail.com
            </a>
            으로 보내 주세요.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>대상 URL과 콘텐츠를 식별할 수 있는 정보</li>
            <li>요청인과 해당 권리의 관계 및 이를 확인할 수 있는 자료</li>
            <li>원하는 조치와 회신받을 연락처</li>
          </ol>
          <p>
            접수된 요청은 대상과 권리 관계를 확인한 뒤 출처 정정, 노출 제한,
            링크 제거 등 필요한 조치를 검토합니다.
          </p>
          <address className="not-italic">
            <p>
              권리 관련 요청:{" "}
              <a className={linkClassName} href="mailto:397love@gmail.com">
                이메일
              </a>
            </p>
            <p>
              일반적인 사이트 오류:{" "}
              <a
                className={linkClassName}
                href="https://github.com/rlatmfrl24/overthewall-schedule/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub 이슈
              </a>
            </p>
          </address>
          <p className="border-l-2 border-border pl-3 text-sm">
            개인정보나 권리 입증 자료는 공개 GitHub 이슈에 올리지 말고 이메일로
            보내 주세요.
          </p>
        </div>
      </RightsSection>
    </ContentPageShell>
  );
}

function RightsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="space-y-4 border-t border-border/70 py-7"
      aria-labelledby={id}
    >
      <h2 id={id} className="text-lg font-semibold sm:text-xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RightsDefinition({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 sm:py-5">
      <dt className="font-medium text-foreground">{term}</dt>
      <dd className="text-sm leading-7 text-muted-foreground sm:text-base">
        {children}
      </dd>
    </div>
  );
}
