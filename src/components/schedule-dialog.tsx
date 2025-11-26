import { useState } from "react";
import type { Member, ScheduleStatus } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { ChevronDownIcon, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Input } from "./ui/input";
import { ButtonGroup, ButtonGroupSeparator } from "./ui/button-group";

interface ScheduleDialogProps {
  onSubmit: (data: {
    member_uid: number;
    date: Date;
    start_time: string | null;
    title: string;
    status: ScheduleStatus;
  }) => void;
  members: Member[];
  initialDate?: Date;
}

export const ScheduleDialog = ({
  onSubmit,
  members,
  initialDate,
}: ScheduleDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [memberUid, setMemberUid] = useState<number | "">("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [date, setDate] = useState(
    initialDate ? new Date(initialDate) : new Date()
  );
  const [status, setStatus] = useState<ScheduleStatus>("방송");
  const [startTime, setStartTime] = useState("");
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (memberUid === "") {
      alert("멤버를 선택해주세요.");
      return;
    }
    onSubmit({
      member_uid: Number(memberUid),
      date,
      status,
      start_time: status === "휴방" ? null : startTime,
      title,
    });

    setMemberUid("");
    setDate(new Date());
    setStatus("방송");
    setStartTime("");
    setTitle("");
    setIsCalendarOpen(false);
    setIsOpen(false);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger>
          <Button variant={"default"}>
            <Plus />
            스케쥴 추가
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스케쥴 추가</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel>멤버</FieldLabel>
                <Select onValueChange={(value) => setMemberUid(Number(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="멤버 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {members.map((member) => (
                        <SelectItem
                          key={member.uid}
                          value={member.uid.toString()}
                        >
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>상태</FieldLabel>
                {status === "휴방" ||
                status === "미정" ||
                status === "게릴라" ? (
                  <FieldDescription>
                    휴방, 미정, 게릴라 입력 시 다른 일정은 모두 삭제되니
                    주의해주세요.
                  </FieldDescription>
                ) : null}

                <ButtonGroup>
                  <Button
                    type="button"
                    variant={status === "방송" ? "default" : "outline"}
                    onClick={() => setStatus("방송")}
                  >
                    방송
                  </Button>
                  <ButtonGroupSeparator />
                  <Button
                    type="button"
                    variant={status === "휴방" ? "default" : "outline"}
                    onClick={() => {
                      setStatus("휴방");
                      setStartTime("");
                      setTitle("휴방");
                    }}
                  >
                    휴방
                  </Button>
                  <ButtonGroupSeparator />
                  <Button
                    type="button"
                    variant={status === "미정" ? "default" : "outline"}
                    onClick={() => {
                      setStatus("미정");
                      setStartTime("");
                      setTitle("미정");
                    }}
                  >
                    미정
                  </Button>
                  <ButtonGroupSeparator />
                  <Button
                    type="button"
                    variant={status === "게릴라" ? "default" : "outline"}
                    onClick={() => {
                      setStatus("게릴라");
                      setStartTime("");
                      setTitle("게릴라");
                    }}
                  >
                    게릴라
                  </Button>
                </ButtonGroup>
              </Field>
              {status == "방송" && (
                <Field>
                  <FieldLabel>날짜 & 시간</FieldLabel>
                  <div className="flex gap-1">
                    <Popover
                      open={isCalendarOpen}
                      onOpenChange={setIsCalendarOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          id="date"
                          className="w-48 justify-between font-normal flex-1"
                        >
                          {date ? date.toLocaleDateString() : "Select date"}
                          <ChevronDownIcon />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-auto overflow-hidden p-0"
                        align="start"
                      >
                        <Calendar
                          mode="single"
                          selected={date}
                          captionLayout="dropdown"
                          onSelect={(date) => {
                            if (!date) return;
                            setDate(date);
                            setIsCalendarOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      className="flex-1"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDate(new Date())}
                    >
                      오늘
                    </Button>
                  </div>
                </Field>
              )}
              <Button type="submit">추가</Button>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
