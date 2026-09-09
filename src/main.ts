import { Plugin, WorkspaceLeaf } from "obsidian";
import { DatalizationView, DATALIZATION_VIEW_TYPE } from "./views/datalizationView";

export default class DatalizationPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(
			DATALIZATION_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new DatalizationView(leaf),
		);

		this.addRibbonIcon("calendar-days", "Open Datalization", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-monthly-dashboard",
			name: "Open monthly dashboard",
			callback: () => {
				void this.activateView();
			},
		});
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(DATALIZATION_VIEW_TYPE);
	}

	private async activateView(): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(DATALIZATION_VIEW_TYPE)[0];
		const leaf = existingLeaf ?? this.app.workspace.getLeaf("tab");

		if (!existingLeaf) {
			await leaf.setViewState({ type: DATALIZATION_VIEW_TYPE, active: true });
		}

		this.app.workspace.revealLeaf(leaf);
	}
}

