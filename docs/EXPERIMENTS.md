# Experiment recipes

## Model vs model

Keep fixed:
- task revision
- agent
- skill set
- timeout
- environment

Change only model.

## Agent vs agent

Keep fixed:
- task
- skill
- model/provider assumptions as much as practical

Change only agent implementation.

## Skill ablation

Run A:
- no skill

Run B:
- exact same configuration
- add one skill

Compare:
- pass rate
- failure modes
- tokens
- cost
- duration
