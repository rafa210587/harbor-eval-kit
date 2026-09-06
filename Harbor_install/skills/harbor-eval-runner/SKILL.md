# Harbor Eval Runner

## Trigger

Use to run model, agent or skill evaluations.

## Before running

1. Run doctor.
2. Confirm secrets exist as environment variables without printing values.
3. Confirm the agent name with `harbor agent list`.
4. Confirm agent kwargs with `harbor agent schema <agent>`.
5. Pin dataset/task revision.
6. Record skill digest/provenance.
7. Record Harbor version and environment details.

## Comparisons

### Model comparison
Same:
- agent
- task
- skill
- resources
- timeout

Change:
- model

### Agent comparison
Same:
- model family where meaningful
- task
- skill

Change:
- agent

### Skill ablation
Same:
- model
- agent
- task

Change:
- skill absent/present

## Required result metadata

- timestamp
- git commit / dataset digest
- task id
- agent
- model
- skills
- Harbor version
- success
- test score
- duration
- token/cost metrics when Harbor exposes them
- failure category
