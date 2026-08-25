import ExtensionAPI from "sap/fe/core/ExtensionAPI";
import Context from "sap/ui/model/odata/v4/Context";

import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Label from "sap/m/Label";
import Button from "sap/m/Button";
import VBox from "sap/m/VBox";
import CheckBox from "sap/m/CheckBox";
import HTML from "sap/ui/core/HTML";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";

type PrintParams = {
    remarks: string;
    withLogo: boolean;
    company: string; 
};

function askPrintParams(): Promise<PrintParams> {
    return new Promise((resolve, reject) => {
        
        const companySelect = new Select({
            items: [
                new Item({ key: "SEARLE", text: "Searle" }),
                new Item({ key: "NOVENTA", text: "Noventa" })
            ],
            width: "70%"
        });

        // --- UPDATED: Added liveChange for self-healing error state ---
        const remarksInput = new Input({
            placeholder: "Enter remarks (Required)",
            width: "70%",
            liveChange: (oEvent: any) => {
                const currentInput = oEvent.getSource();
                if (currentInput.getValue().trim() !== "") {
                    currentInput.setValueState("None");
                    currentInput.setValueStateText("");
                }
            }
        });

        const withLogoCheckBox = new CheckBox({
            text: "With Logo / PNAC",
            selected: false
        }).addStyleClass("sapUiSmallMarginTop");

        const dialog = new Dialog({
            title: "Print Finished Goods CoA",
            contentWidth: "30rem",
            content: [
                new VBox({
                    width: "100%",
                    items: [
                        new Label({ text: "Company Format:" }),
                        companySelect,
                        // --- UPDATED: Added required: true ---
                        new Label({ text: "Remarks:", required: true }).addStyleClass("sapUiSmallMarginTop"),
                        remarksInput,
                        withLogoCheckBox
                    ]
                }).addStyleClass("sapUiSmallMargin")
            ],
            beginButton: new Button({
                text: "Generate Preview",
                type: "Emphasized",
                press: () => {
                    const remarks = remarksInput.getValue().trim(); // Use trim() to prevent space-only bypass
                    
                    // --- NEW VALIDATION BLOCK ---
                    if (!remarks) {
                        remarksInput.setValueState("Error");
                        remarksInput.setValueStateText("Remarks are mandatory. Please enter a value.");
                        return; // Halt execution
                    }
                    // ----------------------------

                    const withLogo = withLogoCheckBox.getSelected();
                    const company = companySelect.getSelectedKey();

                    dialog.close();

                    resolve({
                        remarks,
                        withLogo,
                        company
                    });
                }
            }),
            endButton: new Button({
                text: "Cancel",
                press: () => {
                    dialog.close();
                    reject(new Error("Cancelled"));
                }
            }),
            afterClose: () => {
                dialog.destroy();
            }
        });

        dialog.open();
    });
}

function getPdfBlobUrl(base64: string, mimeType: string): string {
    if (!base64) {
        throw new Error("Empty PDF content received.");
    }

    let cleanedBase64 = String(base64).trim();

    if (cleanedBase64.includes(",")) {
        cleanedBase64 = cleanedBase64.split(",")[1];
    }

    cleanedBase64 = cleanedBase64.replace(/-/g, "+").replace(/_/g, "/");
    cleanedBase64 = cleanedBase64.replace(/\s/g, "");

    while (cleanedBase64.length % 4 !== 0) {
        cleanedBase64 += "=";
    }

    const byteCharacters = window.atob(cleanedBase64);
    const byteNumbers: number[] = [];

    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers.push(byteCharacters.charCodeAt(i));
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {
        type: mimeType || "application/pdf"
    });

    return URL.createObjectURL(blob);
}

async function extractActionResult(result: any): Promise<any> {
    console.log("GenerateCoA raw result:", result);

    let actionContext: any = null;

    if (Array.isArray(result)) {
        actionContext = result[0]?.value || result[0];
    } else {
        actionContext = result?.value || result;
    }

    console.log("GenerateCoA actionContext:", actionContext);

    let resultData: any = null;

    if (actionContext?.requestObject) {
        resultData = await actionContext.requestObject();
    } else if (actionContext?.getObject) {
        resultData = actionContext.getObject();
    } else if (actionContext?.context?.requestObject) {
        resultData = await actionContext.context.requestObject();
    } else if (actionContext?.context?.getObject) {
        resultData = actionContext.context.getObject();
    } else {
        resultData = actionContext;
    }

    console.log("GenerateCoA resultData:", resultData);

    return resultData;
}

export async function GenerateCoA(
    this: ExtensionAPI,
    context: Context | undefined,
    selectedContexts: Context[]
): Promise<void> {
    try {
        if (!selectedContexts || selectedContexts.length === 0) {
            MessageBox.warning("Please select one inspection lot first.");
            return;
        }

        if (selectedContexts.length > 1) {
            MessageBox.warning("Please select only one inspection lot.");
            return;
        }

        const selectedContext = selectedContexts[0];

        // 1. Get all three parameters from the dialog
        const printParams = await askPrintParams();

        const result: any = await (this as any).editFlow.invokeAction(
            "ZQM_FGCOA_SRV.GenerateCoA",
            {
                contexts: [selectedContext],
                parameterValues: [
                    {
                        name: "Remarks",
                        value: printParams.remarks
                    },
                    {
                        name: "WithLogo",
                        value: printParams.withLogo ? "X" : ""
                    },
                    {
                        name: "CompanyCode", // <-- Passed to backend 
                        value: printParams.company
                    }
                ],
                skipParameterDialog: true,
                invocationGrouping: "Isolated"
            }
        );

        const resultData = await extractActionResult(result);

        const fileContent =
            resultData?.FileContent ||
            resultData?.fileContent ||
            resultData?.FILECONTENT ||
            resultData?.PdfBase64 ||
            resultData?.pdfBase64;

        const fileName =
            resultData?.FileName ||
            resultData?.fileName ||
            resultData?.FILENAME ||
            `FG_CoA_${printParams.company}.pdf`;

        const mimeType =
            resultData?.MimeType ||
            resultData?.mimeType ||
            resultData?.MIMETYPE ||
            "application/pdf";

        if (!fileContent) {
            MessageBox.error(
                "PDF data was not returned from backend. Check browser console logs."
            );
            return;
        }

        const pdfUrl = getPdfBlobUrl(fileContent, mimeType);

        const pdfViewer = new HTML({
            content: `<iframe src="${pdfUrl}" width="100%" height="580px" style="border: none;"></iframe>`
        });

        const previewDialog = new Dialog({
            title: `Finished Goods CoA Preview - ${printParams.company}`,
            contentWidth: "1000px",
            contentHeight: "700px",
            content: [pdfViewer],
            beginButton: new Button({
                text: "Download PDF",
                type: "Emphasized",
                press: () => {
                    const link = document.createElement("a");
                    link.href = pdfUrl;
                    link.download = fileName;

                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }),
            endButton: new Button({
                text: "Close",
                press: () => {
                    previewDialog.close();
                }
            }),
            afterClose: () => {
                previewDialog.destroy();
                URL.revokeObjectURL(pdfUrl);
            }
        });

        previewDialog.open();

        MessageToast.show("Preview generated successfully.");
    } catch (error: any) {
        if (error?.message === "Cancelled") {
            return;
        }
        console.error("GenerateCoA error:", error);
        MessageBox.error(error?.message || "Error while generating Finished Goods CoA PDF.");
    }
}