export type RiskAllocationConstraint = "Risk ceiling" | "Beta ceiling" | "Position ceiling" | "Budget";

export type ConstrainedRiskAllocationInput = {
  covarianceMatrix: number[][];
  betas: number[];
  riskBudgets: number[];
  targetVolatility: number;
  targetBeta: number;
  maxPosition: number;
};

export type ConstrainedRiskAllocationResult = {
  weights: number[];
  investedWeight: number;
  cashWeight: number;
  estimatedVolatility: number;
  beta: number;
  riskBudgets: number[];
  riskContributions: number[];
  bindingConstraints: RiskAllocationConstraint[];
  solverStatus: "Solved" | "Numerical fallback";
  iterations: number;
};

const tiny = 1e-12;

function dot(first: number[], second: number[]) {
  return first.reduce((sum, value, index) => sum + value * second[index], 0);
}

function multiply(matrix: number[][], vector: number[]) {
  return matrix.map((row) => dot(row, vector));
}

function portfolioVolatility(weights: number[], covarianceMatrix: number[][]) {
  return Math.sqrt(Math.max(dot(weights, multiply(covarianceMatrix, weights)), 0));
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    if (Math.abs(augmented[column][column]) < tiny) return null;
    for (let row = column + 1; row < n; row++) {
      const scale = augmented[row][column] / augmented[column][column];
      for (let entry = column; entry <= n; entry++) augmented[row][entry] -= scale * augmented[column][entry];
    }
  }
  const solution = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    const remainder = augmented[row][n] - augmented[row].slice(row + 1, n).reduce((sum, value, index) => sum + value * solution[row + 1 + index], 0);
    solution[row] = remainder / augmented[row][row];
  }
  return solution.every(Number.isFinite) ? solution : null;
}

function normalizedBudgets(riskBudgets: number[]) {
  const positive = riskBudgets.map((budget) => Math.max(Number.isFinite(budget) ? budget : 0, 1e-8));
  const total = positive.reduce((sum, budget) => sum + budget, 0);
  return positive.map((budget) => budget / total);
}

function regularizeCovariance(covarianceMatrix: number[][]) {
  const n = covarianceMatrix.length;
  const averageVariance = covarianceMatrix.reduce((sum, row, index) => sum + Math.max(row[index] ?? 0, 0), 0) / Math.max(n, 1);
  const ridge = Math.max(averageVariance * 1e-8, 1e-10);
  return covarianceMatrix.map((row, first) => row.map((value, second) => {
    const symmetric = ((Number.isFinite(value) ? value : 0) + (Number.isFinite(covarianceMatrix[second]?.[first]) ? covarianceMatrix[second][first] : 0)) / 2;
    return symmetric + (first === second ? ridge : 0);
  }));
}

function riskAllocationObjective(weights: number[], covarianceMatrix: number[][], budgets: number[]) {
  return .5 * dot(weights, multiply(covarianceMatrix, weights)) - budgets.reduce((sum, budget, index) => sum + budget * Math.log(Math.max(weights[index], tiny)), 0);
}

/**
 * Solves the convex risk-allocation direction
 *
 *   minimize  1/2 x' Sigma x - sum_i rho_i log(x_i),  x > 0,
 *
 * then applies the largest common scale that satisfies the displayed risk,
 * beta, position and budget ceilings. Cash absorbs the residual. This is the
 * constrained-risk-allocation construction described by Johansson (2025).
 */
export function solveConstrainedRiskAllocation(input: ConstrainedRiskAllocationInput): ConstrainedRiskAllocationResult {
  const n = input.covarianceMatrix.length;
  if (!n || input.betas.length !== n || input.riskBudgets.length !== n) {
    return { weights: [], investedWeight: 0, cashWeight: 1, estimatedVolatility: 0, beta: 0, riskBudgets: [], riskContributions: [], bindingConstraints: ["Budget"], solverStatus: "Numerical fallback", iterations: 0 };
  }

  const budgets = normalizedBudgets(input.riskBudgets);
  const covariance = regularizeCovariance(input.covarianceMatrix);
  let direction = budgets.map((budget, index) => Math.sqrt(budget / Math.max(covariance[index][index], 1e-8)));
  const initialVolatility = portfolioVolatility(direction, covariance);
  if (initialVolatility > tiny) direction = direction.map((weight) => weight / initialVolatility);

  let status: ConstrainedRiskAllocationResult["solverStatus"] = "Solved";
  let iterations = 0;
  for (; iterations < 40; iterations++) {
    const covarianceWeights = multiply(covariance, direction);
    const gradient = direction.map((weight, index) => covarianceWeights[index] - budgets[index] / Math.max(weight, tiny));
    const hessian = covariance.map((row, first) => row.map((value, second) => value + (first === second ? budgets[first] / Math.max(direction[first] ** 2, tiny) : 0)));
    const solved = solveLinearSystem(hessian, gradient);
    if (!solved) { status = "Numerical fallback"; break; }
    const stepDirection = solved.map((value) => -value);
    const decrement = -dot(gradient, stepDirection);
    if (!Number.isFinite(decrement) || decrement / 2 < 1e-11) break;

    let step = 1;
    stepDirection.forEach((value, index) => { if (value < 0) step = Math.min(step, -.99 * direction[index] / value); });
    const currentObjective = riskAllocationObjective(direction, covariance, budgets);
    let accepted = false;
    for (let search = 0; search < 24; search++) {
      const candidate = direction.map((weight, index) => weight + step * stepDirection[index]);
      const candidateObjective = riskAllocationObjective(candidate, covariance, budgets);
      if (candidate.every((weight) => weight > 0) && candidateObjective <= currentObjective + .01 * step * dot(gradient, stepDirection)) {
        direction = candidate;
        accepted = true;
        break;
      }
      step *= .5;
    }
    if (!accepted) { status = "Numerical fallback"; break; }
  }

  const directionTotal = direction.reduce((sum, weight) => sum + weight, 0);
  const directionVolatility = portfolioVolatility(direction, input.covarianceMatrix);
  const directionBeta = dot(direction, input.betas);
  const scales: { label: RiskAllocationConstraint; value: number }[] = [
    { label: "Budget", value: directionTotal > tiny ? 1 / directionTotal : 0 },
    { label: "Risk ceiling", value: directionVolatility > tiny ? Math.max(input.targetVolatility, 0) / directionVolatility : Number.POSITIVE_INFINITY },
    { label: "Beta ceiling", value: directionBeta > tiny ? Math.max(input.targetBeta, 0) / directionBeta : Number.POSITIVE_INFINITY },
    { label: "Position ceiling", value: direction.reduce((limit, weight) => weight > tiny ? Math.min(limit, Math.max(input.maxPosition, 0) / weight) : limit, Number.POSITIVE_INFINITY) },
  ];
  const scale = Math.max(0, Math.min(...scales.map((constraint) => constraint.value)));
  const weights = direction.map((weight) => Math.max(0, weight * scale));
  const investedWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const estimatedVolatility = portfolioVolatility(weights, input.covarianceMatrix);
  const beta = dot(weights, input.betas);
  const covarianceWeights = multiply(input.covarianceMatrix, weights);
  const portfolioVariance = Math.max(dot(weights, covarianceWeights), 0);
  const riskContributions = weights.map((weight, index) => portfolioVariance > tiny ? weight * covarianceWeights[index] / portfolioVariance : 0);
  const tolerance = Math.max(Math.abs(scale) * 1e-6, 1e-9);
  const bindingConstraints = scales.filter((constraint) => Number.isFinite(constraint.value) && Math.abs(constraint.value - scale) <= tolerance).map((constraint) => constraint.label);

  return {
    weights,
    investedWeight,
    cashWeight: Math.max(0, 1 - investedWeight),
    estimatedVolatility,
    beta,
    riskBudgets: budgets,
    riskContributions,
    bindingConstraints: bindingConstraints.length ? bindingConstraints : ["Budget"],
    solverStatus: status,
    iterations,
  };
}
