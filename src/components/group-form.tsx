"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createGroupAction, updateGroupAction } from "@/app/actions";
import { GROUP_CATEGORIES } from "@/lib/constants";
import { CURRENCIES } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import { groupSchema, type GroupInput } from "@/lib/validation";
import { Button } from "./ui/button";
import { FieldError, Input, Label, NativeSelect, Textarea } from "./ui/input";

export function GroupForm({
  defaultCurrency,
  group,
}: {
  defaultCurrency: string;
  group?: { id: string; name: string; description: string | null; category: GroupInput["category"]; currency: string; coverImageUrl: string | null };
}) {
  const router = useRouter();
  const form = useForm<GroupInput>({
    resolver: zodResolver(groupSchema) as never,
    defaultValues: {
      name: group?.name ?? "",
      description: group?.description ?? "",
      category: group?.category ?? "trip",
      currency: group?.currency ?? defaultCurrency,
      coverImageUrl: group?.coverImageUrl ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const category = useWatch({ control: form.control, name: "category" });

  const onSubmit = form.handleSubmit(async (values) => {
    if (group) {
      const result = await updateGroupAction(group.id, {
        name: values.name,
        description: values.description,
        category: values.category,
        coverImageUrl: values.coverImageUrl,
      });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Group updated");
      router.refresh();
      return;
    }
    const result = await createGroupAction(values);
    if (!result.ok) return void toast.error(result.error);
    toast.success("Group created");
    router.push(`/groups/${result.data.id}`);
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Group name</Label>
        <Input id="name" placeholder="Goa trip, Flat 4B, Friday dinners…" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError>{errors.name?.message}</FieldError>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GROUP_CATEGORIES.map((c) => (
            <label
              key={c.value}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                category === c.value ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <input type="radio" value={c.value} className="sr-only" {...form.register("category")} />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currency">Currency</Label>
        <NativeSelect id="currency" disabled={!!group} {...form.register("currency")}>
          {Object.values(CURRENCIES).map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          {group ? "A group's currency can't change once it has expenses." : "All expenses in this group use this currency."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id="description" rows={2} {...form.register("description")} />
        <FieldError>{errors.description?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="coverImageUrl">
          Cover image URL <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="coverImageUrl" type="url" placeholder="https://…" aria-invalid={!!errors.coverImageUrl} {...form.register("coverImageUrl")} />
        <FieldError>{errors.coverImageUrl?.message}</FieldError>
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={isSubmitting} size="lg" className="flex-1 sm:flex-none">
          {group ? "Save changes" : "Create group"}
        </Button>
        {!group && (
          <Button type="button" variant="ghost" size="lg" onClick={() => router.back()}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
