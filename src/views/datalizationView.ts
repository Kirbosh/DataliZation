import {
	ItemView,
	TAbstractFile,
	TFile,
	ViewStateResult,
	WorkspaceLeaf,
	parseYaml,
	setIcon,
} from "obsidian";

export const DATALIZATION_VIEW_TYPE = "datalization-monthly-dashboard";

interface DatalizationViewState extends Record<string, unknown> {
	month?: string;
}

interface DailyRecord {
	date: Date;
	file: TFile;
	highFluctuation: boolean;
	mood: number | null;
	pillTaken: boolean;
	sleep: number | null;
	expenses: number | null;
}

const DAILY_NOTE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export class DatalizationView extends ItemView {
	private currentMonth: Date;
	private refreshTimer: number | undefined;
	private renderGeneration = 0;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		const now = new Date();
		this.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	}

	getViewType(): string {
		return DATALIZATION_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Datalization";
	}

	getIcon(): string {
		return "calendar-days";
	}

	async onOpen(): Promise<void> {
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (DAILY_NOTE_PATTERN.test(file.basename)) this.scheduleRender();
		}));
		this.registerEvent(this.app.vault.on("create", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("rename", (file) => this.handleVaultChange(file)));
		await this.render();
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
		this.renderGeneration += 1;
	}

	getState(): DatalizationViewState {
		return { month: this.toMonthKey(this.currentMonth) };
	}

	async setState(state: DatalizationViewState, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		if (typeof state.month === "string" && /^\d{4}-\d{2}$/.test(state.month)) {
			const [year, month] = state.month.split("-").map(Number);
			this.currentMonth = new Date(year, month - 1, 1);
		}
		if (this.contentEl.isConnected) await this.render();
	}

	private handleVaultChange(file: TAbstractFile): void {
		if (file instanceof TFile && file.extension === "md" && DAILY_NOTE_PATTERN.test(file.basename)) {
			this.scheduleRender();
		}
	}

	private scheduleRender(): void {
		if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = undefined;
			void this.render();
		}, 150);
	}

	private async render(): Promise<void> {
		const generation = ++this.renderGeneration;
		const records = await this.readMonth(this.currentMonth);
		if (generation !== this.renderGeneration) return;

		this.contentEl.empty();
		this.contentEl.addClass("datalization-view");

		const shell = this.contentEl.createDiv({ cls: "datalization-shell" });
		this.renderHeader(shell);
		this.renderSummary(shell, records);
		this.renderCalendar(shell, records);
		this.renderLegend(shell);
	}

	private renderHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: "datalization-header" });
		const heading = header.createDiv({ cls: "datalization-heading" });
		heading.createEl("h1", { text: "Datalization" });
		heading.createEl("div", {
			cls: "datalization-month-title",
			text: this.currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
		});

		const navigation = header.createDiv({ cls: "datalization-navigation" });
		const previousButton = navigation.createEl("button", {
			cls: "datalization-icon-button",
			attr: { "aria-label": "Previous month", title: "Previous month" },
		});
		setIcon(previousButton, "chevron-left");
		previousButton.addEventListener("click", () => this.changeMonth(-1));

		const todayButton = navigation.createEl("button", {
			cls: "datalization-today-button",
			text: "Today",
		});
		todayButton.addEventListener("click", () => {
			const today = new Date();
			this.currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
			void this.render();
		});

		const nextButton = navigation.createEl("button", {
			cls: "datalization-icon-button",
			attr: { "aria-label": "Next month", title: "Next month" },
		});
		setIcon(nextButton, "chevron-right");
		nextButton.addEventListener("click", () => this.changeMonth(1));
	}

	private renderSummary(container: HTMLElement, records: DailyRecord[]): void {
		const summary = container.createDiv({ cls: "datalization-summary" });
		this.createSummaryCard(summary, "Days logged", String(records.length));
		this.createSummaryCard(summary, "Average mood", this.average(records.map((record) => record.mood)));
		this.createSummaryCard(summary, "Average sleep", this.average(records.map((record) => record.sleep), " h"));

		const expenses = records
			.map((record) => record.expenses)
			.filter((value): value is number => value !== null);
		const totalExpenses = expenses.reduce((total, value) => total + value, 0);
		this.createSummaryCard(summary, "Total expenses", expenses.length ? this.formatNumber(totalExpenses) : "—");
	}

	private createSummaryCard(container: HTMLElement, label: string, value: string): void {
		const card = container.createDiv({ cls: "datalization-summary-card" });
		card.createDiv({ cls: "datalization-summary-value", text: value });
		card.createDiv({ cls: "datalization-summary-label", text: label });
	}

	private renderCalendar(container: HTMLElement, records: DailyRecord[]): void {
		const calendar = container.createDiv({ cls: "datalization-calendar" });
		const weekdayHeader = calendar.createDiv({ cls: "datalization-weekdays" });
		for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
			weekdayHeader.createDiv({ cls: "datalization-weekday", text: weekday });
		}

		const grid = calendar.createDiv({ cls: "datalization-grid" });
		const firstWeekday = new Date(
			this.currentMonth.getFullYear(),
			this.currentMonth.getMonth(),
			1,
		).getDay();

		for (let index = 0; index < firstWeekday; index += 1) {
			grid.createDiv({ cls: "datalization-day-spacer" });
		}

		const recordsByDay = new Map(records.map((record) => [record.date.getDate(), record]));
		const daysInMonth = new Date(
			this.currentMonth.getFullYear(),
			this.currentMonth.getMonth() + 1,
			0,
		).getDate();

		for (let day = 1; day <= daysInMonth; day += 1) {
			this.renderDay(grid, day, recordsByDay.get(day));
		}
	}

	private renderDay(grid: HTMLElement, day: number, record: DailyRecord | undefined): void {
		const date = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), day);
		const card = grid.createEl("button", {
			cls: `datalization-day${record ? " datalization-day-has-data" : " datalization-day-empty"}`,
			attr: {
				"aria-label": this.describeDay(date, record),
				title: this.describeDay(date, record),
			},
		});

		card.createDiv({ cls: "datalization-date-number", text: String(day) });

		if (!record) {
			card.createDiv({ cls: "datalization-no-data", text: "—" });
			return;
		}

		if (record.mood !== null) {
			const gradient = this.moodGradient(record.mood);
			card.style.setProperty("--datalization-mood-hue", String(gradient.startHue));
			card.style.setProperty("--datalization-mood-end-hue", String(gradient.endHue));
			card.createDiv({ cls: "datalization-mood", text: this.formatNumber(record.mood) });
		} else {
			card.addClass("datalization-day-no-mood");
			card.createDiv({ cls: "datalization-mood datalization-value-missing", text: "—" });
		}

		const sleepPanel = card.createDiv({ cls: "datalization-sleep" });
		sleepPanel.createSpan({ text: record.sleep === null ? "—" : this.formatNumber(record.sleep) });

		const indicators = card.createDiv({ cls: "datalization-indicators" });
		if (record.highFluctuation) {
			indicators.createSpan({
				cls: "datalization-indicator datalization-indicator-fluctuation",
				attr: { "aria-label": "High fluctuation" },
			});
		}
		if (record.pillTaken) {
			indicators.createSpan({
				cls: "datalization-indicator datalization-indicator-pill",
				attr: { "aria-label": "Pill taken" },
			});
		}

		card.addEventListener("click", () => {
			void this.app.workspace.getLeaf(false).openFile(record.file);
		});
	}

	private renderLegend(container: HTMLElement): void {
		const legend = container.createDiv({ cls: "datalization-legend" });
		const gradient = legend.createDiv({ cls: "datalization-gradient-legend" });
		gradient.createSpan({ text: "Low mood" });
		gradient.createSpan({ cls: "datalization-gradient" });
		gradient.createSpan({ text: "High mood" });

		const flags = legend.createDiv({ cls: "datalization-flag-legend" });
		const fluctuation = flags.createSpan({ cls: "datalization-legend-item" });
		fluctuation.createSpan({ cls: "datalization-indicator datalization-indicator-fluctuation" });
		fluctuation.createSpan({ text: "High fluctuation" });
		const pill = flags.createSpan({ cls: "datalization-legend-item" });
		pill.createSpan({ cls: "datalization-indicator datalization-indicator-pill" });
		pill.createSpan({ text: "Pill taken" });
	}

	private changeMonth(offset: number): void {
		this.currentMonth = new Date(
			this.currentMonth.getFullYear(),
			this.currentMonth.getMonth() + offset,
			1,
		);
		void this.render();
	}

	private async readMonth(month: Date): Promise<DailyRecord[]> {
		const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-`;
		const matchingFiles = this.app.vault.getMarkdownFiles().filter((file) => {
			return file.basename.startsWith(prefix) && DAILY_NOTE_PATTERN.test(file.basename);
		});

		const records = await Promise.all(matchingFiles.map(async (file) => {
			const match = DAILY_NOTE_PATTERN.exec(file.basename);
			if (!match) return null;

			const year = Number(match[1]);
			const monthIndex = Number(match[2]) - 1;
			const day = Number(match[3]);
			const date = new Date(year, monthIndex, day);
			if (
				date.getFullYear() !== year ||
				date.getMonth() !== monthIndex ||
				date.getDate() !== day
			) return null;

			let frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter) {
				const content = await this.app.vault.cachedRead(file);
				const yaml = FRONTMATTER_PATTERN.exec(content)?.[1];
				if (yaml) {
					try {
						frontmatter = parseYaml(yaml) as Record<string, unknown>;
					} catch (error) {
						console.warn(`Datalization: could not parse frontmatter in ${file.path}`, error);
					}
				}
			}

			const data = frontmatter ?? {};
			return {
				date,
				file,
				mood: this.toNumber(data["mood"]),
				sleep: this.toNumber(data["hours slept"]),
				expenses: this.toNumber(data["expenses"]),
				pillTaken: this.toBoolean(data["Pill taken"]),
				highFluctuation: this.toBoolean(data["High fluctuation"]),
			};
		}));

		return records
			.filter((record): record is DailyRecord => record !== null)
			.sort((left, right) => left.date.getTime() - right.date.getTime());
	}

	private describeDay(date: Date, record: DailyRecord | undefined): string {
		const lines = [date.toLocaleDateString(undefined, { dateStyle: "long" })];
		if (!record) return `${lines[0]}: no daily note`;

		lines.push(`Mood: ${record.mood ?? "not set"}`);
		lines.push(`Hours slept: ${record.sleep ?? "not set"}`);
		lines.push(`Expenses: ${record.expenses ?? "not set"}`);
		if (record.highFluctuation) lines.push("High fluctuation");
		if (record.pillTaken) lines.push("Pill taken");
		return lines.join("\n");
	}

	private moodGradient(mood: number): { startHue: number; endHue: number } {
		const clamped = Math.min(10, Math.max(1, mood));
		const normalized = (clamped - 1) / 9;
		const startHue = Math.round(normalized * 86);
		return {
			startHue,
			endHue: Math.round(startHue + normalized * 69),
		};
	}

	private average(values: Array<number | null>, suffix = ""): string {
		const numericValues = values.filter((value): value is number => value !== null);
		if (!numericValues.length) return "—";
		const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
		return `${this.formatNumber(Math.round(average * 10) / 10)}${suffix}`;
	}

	private toNumber(value: unknown): number | null {
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim() !== "") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
		return null;
	}

	private toBoolean(value: unknown): boolean {
		return value === true || value === 1 || (typeof value === "string" && value.toLowerCase() === "true");
	}

	private formatNumber(value: number): string {
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
	}

	private toMonthKey(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
	}
}

