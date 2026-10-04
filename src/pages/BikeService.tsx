import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, LinkButton } from "@/components/Button";
import { Card, SectionTitle } from "@/components/Card";
import { TextField } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { GetPartsLink, PartsDisclosure } from "@/components/parts/GetPartsLink";
import { ModsList } from "@/components/parts/ModsList";
import { MyParts } from "@/components/parts/MyParts";
import { DueBar } from "@/components/service/DueBar";
import { LogServiceForm } from "@/components/service/LogServiceForm";
import { ServiceHistoryList } from "@/components/service/ServiceHistoryList";
import { Stat } from "@/components/Stat";
import { EmptyState } from "@/components/States";
import { ensureSchedule, removeServiceRecord, removeServiceTask, saveServiceTask } from "@/data/actions";
import { taskQuery } from "@/domain/parts";
import { formatDate } from "@/domain/time";
import type { ServiceTask } from "@/domain/types";
import { useBikeService } from "@/hooks/useBikeService";
import { uuid } from "@/lib/id";

export default function BikeService() {
  const { bikeId } = useParams();
  const data = useBikeService(bikeId);
  const [form, setForm] = useState<"service" | "reading" | null>(null);
  const [editing, setEditing] = useState(false);
  // Bikes added before servicing existed get the default schedule on first visit.
  useEffect(() => { if (data && !data.tasks.length) ensureSchedule(data.bike); }, [data]);
  if (!data) return <EmptyState title="Bike not found" action={<LinkButton to="/garage">Garage</LinkButton>} />;
  const { bike, hours, status, records, tasks } = data;

  return (
    <div className="space-y-5">
      <PageHeader back="/garage" eyebrow={[bike.year, bike.manufacturer].filter(Boolean).join(" · ")} title={bike.model} />

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Engine hours" value={`${hours.total} h`} size="lg" tone="plate" />
          <Stat label="Recorded by TrackStats" value={`${hours.recorded} h`} sub="ride time incl. pits" />
        </div>
        <p className="text-sm text-muted">
          {hours.meter
            ? <>Based on your hour meter ({hours.meter.hours} h on {formatDate(hours.meter.performedAt)}) plus rides recorded since.</>
            : bike.startHours ? <>Based on the {bike.startHours} h the bike had when added, plus rides recorded since.</>
            : <>Rides recorded in TrackStats. Rides without the app aren't counted, so enter your hour meter now and then.</>}
        </p>
        {!form && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" className="whitespace-nowrap px-3" onClick={() => setForm("service")}><Icon name="check" className="size-5" /> Log service</Button>
            <Button className="whitespace-nowrap px-3" onClick={() => setForm("reading")}><Icon name="clock" className="size-5" /> Hour meter</Button>
          </div>
        )}
        {form && <LogServiceForm key={form} bike={bike} tasks={tasks} hoursNow={hours.total} kind={form} onDone={() => setForm(null)} />}
      </Card>

      <Card className="space-y-4">
        <SectionTitle action={<Button variant="ghost" className="min-h-11 px-2 text-sm text-plate" onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit schedule"}</Button>}>Service schedule</SectionTitle>
        {editing ? <ScheduleEditor bikeId={bike.id} tasks={tasks} /> : status.map((s) => {
          const q = s.state === "due" || s.state === "soon" ? taskQuery(bike, s.task.name) : null;
          return <DueBar key={s.task.id} s={s} action={q ? <GetPartsLink query={q} /> : undefined} />;
        })}
        <p className="text-xs text-muted">Typical intervals for a motocross bike ridden hard. Check your owner's manual and adjust them for your bike and riding.</p>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>My parts</SectionTitle>
        <MyParts bike={bike} />
        <PartsDisclosure />
      </Card>

      <Card className="space-y-2">
        <SectionTitle>Modifications</SectionTitle>
        <ModsList bike={bike} editable />
      </Card>

      <Card>
        <SectionTitle action={<LinkButton to={`/garage/${bike.id}/history`} className="min-h-10 px-3 text-sm"><Icon name="share" className="size-4" /> For selling</LinkButton>}>Service history</SectionTitle>
        <ServiceHistoryList bike={bike} records={records} tasks={tasks} onDelete={removeServiceRecord} />
      </Card>
    </div>
  );
}

function ScheduleEditor({ bikeId, tasks }: { bikeId: string; tasks: ServiceTask[] }) {
  const [name, setName] = useState("");
  const [hrs, setHrs] = useState("");
  const num = (v: string) => (v.trim() && Number(v) > 0 ? Number(v) : null);
  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <div key={t.id} className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-2">
          <TextField label="Job" value={t.name} onChange={(e) => saveServiceTask({ ...t, name: e.target.value })} />
          <TextField label="Hours" inputMode="decimal" value={t.intervalHours ?? ""} onChange={(e) => saveServiceTask({ ...t, intervalHours: num(e.target.value) })} />
          <TextField label="Months" inputMode="numeric" value={t.intervalDays ? Math.round(t.intervalDays / 30) : ""} onChange={(e) => { const m = num(e.target.value); saveServiceTask({ ...t, intervalDays: m ? Math.round(m * 30) : null }); }} />
          <Button variant="ghost" aria-label={`Remove ${t.name}`} className="text-muted" onClick={() => removeServiceTask(t.id)}><Icon name="x" className="size-5" /></Button>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_5rem_auto] items-end gap-2 border-t border-line pt-3">
        <TextField label="New job" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clutch plates" />
        <TextField label="Hours" inputMode="decimal" value={hrs} onChange={(e) => setHrs(e.target.value)} />
        <Button disabled={!name.trim()} onClick={() => { saveServiceTask({ id: uuid(), bikeId, name: name.trim(), intervalHours: num(hrs), intervalDays: null, sortOrder: tasks.length }); setName(""); setHrs(""); }}>Add</Button>
      </div>
    </div>
  );
}
