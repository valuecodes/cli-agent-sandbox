type RunPythonUsageOptions = {
  seed: number;
  dataPath: string;
};

export const buildRunPythonUsage = ({
  seed,
  dataPath,
}: RunPythonUsageOptions): string =>
  [
    "Use runPython with:",
    '- scriptName: "run_experiment.py"',
    `- input: { "featureIds": [...your features...], "seed": ${seed}, "dataPath": "${dataPath}" }`,
  ].join("\n");

export const buildRecoveryPrompt = (
  message: string,
  options: RunPythonUsageOptions
): string => [message, "", buildRunPythonUsage(options)].join("\n");
