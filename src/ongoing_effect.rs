use std::error::Error;
use std::fs;
use std::io;
use std::path::Path;

use clause_package::*;
use clause_runtime::*;

use crate::MOONWELL_PULSE_SOURCE;
use crate::conquest::{materialize_conquest_program_v1, run_native_conquest_v1};

const EFFECT_APPLICATION_LOCAL: ApplicationLocalId = ApplicationLocalId::new(1);
const EFFECT_ENTRY: u16 = 0;

pub struct OngoingEffectProgramV1 {
    pub exact_cwr1: Vec<u8>,
    pub occurrences: Vec<Vec<u8>>,
}

pub struct NativeOngoingEffectConquestV1 {
    pub activation: ActivationId,
    pub first_step: ExecutableStepV1,
    pub suspension: ExecutableSuspensionV1,
    pub resumption: ExecutableResumptionV1,
    pub second_step: ExecutableStepV1,
    pub intent: EffectIntentOccurrenceV1,
    pub authorization: IssuedEffectAuthorizationV1,
    pub attempt: EffectAttemptOccurrenceV1,
    pub receipt: EffectReceiptOccurrenceV1,
    pub observation: Observation,
    pub judgment: EffectJudgmentOccurrenceV1,
    pub causal_chain: Vec<(CausalRef, Vec<CausalRef>)>,
    pub initial_state_revision_count: usize,
    pub settled_state_revision_count: usize,
    pub initial_candidate_delta_count: usize,
    pub settled_candidate_delta_count: usize,
    pub effect_created_admission: bool,
    pub exact_host_bytes: Vec<u8>,
    pub admitted_predecessor: StateRevisionId,
    pub admitted_successor: StateRevisionId,
}

pub fn materialize_ongoing_effect_program_v1() -> Result<OngoingEffectProgramV1, Box<dyn Error>> {
    let conquest = materialize_conquest_program_v1()?;
    let template = decode_wasm_process_request_v1(&conquest.exact_cwr1)?;
    let template_package = check_process_package(decode_process_package(&template.package_bytes)?)?;
    let scope = TermScope {
        universe: template_package.constitution().universe(),
        semantics: template_package.constitution().semantics(),
    };
    let (package, mode_local) =
        checked_effect_package(scope, template.authority.session, template.authority.change)?;
    let plan = effect_physical_plan(&package, mode_local)?;
    let occurrences = vec![opaque_effect_step(1.0)?, opaque_effect_step(2.0)?];
    let mut request = WasmProcessRequestV1 {
        package_bytes: package.exact_bytes().to_vec(),
        application: EFFECT_APPLICATION_LOCAL,
        physical_plan_bytes: encode_executable_physical_plan_v1(&plan)?,
        allocation: template.allocation,
        authority: template.authority,
        occurrences: occurrences.clone(),
        render_slots: vec![],
    };

    // Fresh native opening deliberately ignores the recorded replay allocation.
    // It gives this exact package/Application/plan its checked allocation epoch,
    // which the resulting CWR1 retains for exact Wasm rematerialization.
    let provisional = encode_wasm_process_request_v1(&request)?;
    let mut session = open_fresh_persistent_process_session_v1(&provisional)?;
    request.allocation = session.allocation();
    session.dispose();

    Ok(OngoingEffectProgramV1 {
        exact_cwr1: encode_wasm_process_request_v1(&request)?,
        occurrences,
    })
}

pub fn run_native_ongoing_effect_conquest_v1(
    target: &Path,
) -> Result<NativeOngoingEffectConquestV1, Box<dyn Error>> {
    let program = materialize_ongoing_effect_program_v1()?;
    let mut session = open_fresh_persistent_process_session_v1(&program.exact_cwr1)?;
    let initial_state_revision_count = session.carrier()?.state_revision_count();
    let initial_candidate_delta_count = session.carrier()?.candidate_delta_count();
    let activation = session.activation()?;

    let first_step = session.apply_opaque_input(&program.occurrences[0])?;
    let suspension = session.suspend()?;
    let resumption = session.resume()?;
    let second_step = session.apply_opaque_input(&program.occurrences[1])?;

    let intent = session.emit_effect_intent()?;
    let authorization = session.issue_effect_authorization(intent.id)?;
    let attempt = session.begin_effect_attempt(authorization.id)?;
    let payload_bytes = canonical_term_bytes(&attempt.payload)?;
    let exact_host_bytes = execute_exact_file_effect(target, &payload_bytes)?;
    let settlement =
        session.settle_effect_attempt(attempt.id, Some((0, exact_host_bytes.clone())))?;
    let receipt_id = settlement
        .receipt
        .ok_or_else(|| io::Error::other("file effect returned no receipt identity"))?;
    let observation_id = settlement
        .observation
        .ok_or_else(|| io::Error::other("file receipt produced no Observation identity"))?;

    let carrier = session.carrier()?;
    let receipt = carrier
        .effect_receipt(receipt_id)
        .cloned()
        .ok_or_else(|| io::Error::other("effect receipt is not queryable"))?;
    let observation = carrier
        .observation(observation_id)
        .cloned()
        .ok_or_else(|| io::Error::other("receipt Observation is not queryable"))?;
    let judgment = carrier
        .effect_judgment(settlement.judgment)
        .cloned()
        .ok_or_else(|| io::Error::other("effect Judgment is not queryable"))?;
    let causal_chain = [
        CausalRef::EffectIntent(intent.id),
        CausalRef::EffectAuthorization(authorization.id),
        CausalRef::EffectAttempt(attempt.id),
        CausalRef::EffectReceipt(receipt_id),
        CausalRef::Observation(observation_id),
        CausalRef::EffectJudgment(settlement.judgment),
    ]
    .into_iter()
    .map(|occurrence| {
        let predecessors = carrier
            .causal_predecessors(occurrence)
            .ok_or_else(|| io::Error::other("effect occurrence lacks a causal record"))?
            .iter()
            .copied()
            .collect();
        Ok((occurrence, predecessors))
    })
    .collect::<Result<Vec<_>, io::Error>>()?;
    let settled_state_revision_count = carrier.state_revision_count();
    let settled_candidate_delta_count = carrier.candidate_delta_count();
    let effect_created_admission = session.last_admitted().is_some();

    // This is intentionally a different Clause process: effect evidence alone
    // changes no world. The existing combat CandidateDelta and its separate
    // Admission are the only operation below that establishes a successor.
    let admitted = run_native_conquest_v1()?;

    Ok(NativeOngoingEffectConquestV1 {
        activation,
        first_step,
        suspension,
        resumption,
        second_step,
        intent,
        authorization,
        attempt,
        receipt,
        observation,
        judgment,
        causal_chain,
        initial_state_revision_count,
        settled_state_revision_count,
        initial_candidate_delta_count,
        settled_candidate_delta_count,
        effect_created_admission,
        exact_host_bytes,
        admitted_predecessor: admitted.admitted.state.predecessor,
        admitted_successor: admitted.admitted.state.id,
    })
}

fn checked_effect_package(
    scope: TermScope,
    session: RuntimeSessionId,
    change: ProgramChangeOccurrenceId,
) -> Result<(CheckedProcessPackage, ModeLocalId), Box<dyn Error>> {
    let cst = read_canonical_source_v1(MOONWELL_PULSE_SOURCE)?;
    let source_artifact = cst.artifact();
    let allocation = plan_independent_canonical_source_allocations_v1(&cst, change)?;
    let compiled = elaborate_canonical_source_package_v1(
        &cst,
        CanonicalSourceContextV1 {
            universe: scope.universe,
            semantics: scope.semantics,
        },
        &allocation,
    )?;
    if !compiled.unsupported.is_empty() {
        return Err(io::Error::other("moonwell source left unsupported productions").into());
    }

    let decoded = decode_process_package(compiled.checked_package.exact_bytes())?;
    let mut candidate = decoded.candidate().clone();
    let constitution = &mut candidate.snapshot.constitution;
    let schema = constitution
        .schemas
        .first()
        .cloned()
        .ok_or_else(|| io::Error::other("moonwell source produced no relation schema"))?;
    let operator = constitution
        .operators
        .first()
        .cloned()
        .ok_or_else(|| io::Error::other("moonwell source produced no operator"))?;
    let mode = operator
        .modes
        .first()
        .cloned()
        .ok_or_else(|| io::Error::other("moonwell source produced no Mode"))?;
    if mode.contract.productivity.kind != ProductivityKindV2::Reactive
        || !matches!(
            mode.contract.continuation,
            ContinuationContractV2::Suspensible {
                use_policy: ContinuationUseV2::Linear,
                ..
            }
        )
        || mode.contract.effect_intents.len() != 1
    {
        return Err(io::Error::other(
            "moonwell source did not retain its reactive linear effect contract",
        )
        .into());
    }

    let mut next_formation = constitution
        .formations
        .iter()
        .map(|formation| formation.id.get())
        .max()
        .unwrap_or(0)
        .checked_add(1)
        .ok_or_else(|| io::Error::other("moonwell Formation space is exhausted"))?;
    let mut bindings = Vec::with_capacity(schema.roles.len());
    let mut binding_formations = Vec::new();
    for role in &schema.roles {
        let value = if mode.known_roles.binary_search(&role.id).is_ok() {
            let id = FormationLocalId::new(next_formation);
            next_formation = next_formation
                .checked_add(1)
                .ok_or_else(|| io::Error::other("moonwell Formation space is exhausted"))?;
            let payload = role
                .target
                .type_term
                .as_atom()
                .ok_or_else(|| io::Error::other("effect role domain is not one Atom"))?
                .canonical_payload()
                .to_vec();
            constitution.formations.push(FormationJudgmentPreimageV2 {
                id,
                context: vec![],
                term: Term::atom(
                    scope,
                    b"clause/source-effect-binding-v1".to_vec(),
                    payload,
                    EqualityContract::ExactOctetsV1,
                )?,
                target: role.target.clone(),
                direct_dependencies: vec![],
            });
            binding_formations.push(id);
            RoleBindingValuePreimageV2::Known(id)
        } else {
            RoleBindingValuePreimageV2::Produced
        };
        bindings.push(RoleBindingPreimageV2 {
            role: role.id,
            occurrence: 0,
            value,
        });
    }

    let application_formation = FormationLocalId::new(next_formation);
    let mut dependencies = vec![
        LocalSemanticDependencyV2::RelationSchema(schema.id),
        LocalSemanticDependencyV2::Operator(operator.id),
        LocalSemanticDependencyV2::Mode(LocalModeRefV2 {
            operator: operator.id,
            mode: mode.id,
        }),
    ];
    dependencies.extend(schema.roles.iter().map(|role| {
        LocalSemanticDependencyV2::Role(LocalRoleRefV2 {
            schema: schema.id,
            role: role.id,
        })
    }));
    dependencies.extend(
        binding_formations
            .iter()
            .copied()
            .map(LocalSemanticDependencyV2::Formation),
    );
    dependencies.extend(
        mode.contract
            .productivity
            .obligations
            .iter()
            .copied()
            .map(LocalSemanticDependencyV2::Formation),
    );
    for capability in &constitution.capabilities {
        dependencies.push(LocalSemanticDependencyV2::Capability(capability.id));
        dependencies.push(LocalSemanticDependencyV2::Formation(capability.formation));
    }
    dependencies.sort();
    dependencies.dedup();
    constitution.formations.push(FormationJudgmentPreimageV2 {
        id: application_formation,
        context: vec![],
        term: Term::atom(
            scope,
            b"clause/source-effect-application-v1".to_vec(),
            source_artifact.as_bytes().to_vec(),
            EqualityContract::ExactOctetsV1,
        )?,
        target: schema.result_domain.clone(),
        direct_dependencies: dependencies.clone(),
    });
    constitution
        .formations
        .sort_by_key(|formation| formation.id);

    let mut dependency_closure = dependencies;
    dependency_closure.push(LocalSemanticDependencyV2::Formation(application_formation));
    dependency_closure.sort();
    constitution
        .applications
        .push(ApplicationDeclarationPreimageV2 {
            id: EFFECT_APPLICATION_LOCAL,
            form: ApplicationFormPreimageV2 {
                formation: application_formation,
                schema: schema.id,
                operator: operator.id,
                eligible_modes: vec![mode.id],
                bindings,
                context_requirements: vec![],
                constraint_discharges: vec![],
                result_domain: schema.result_domain,
                direct_dependencies: vec![],
                dependency_closure,
            },
        });

    let initial_payload = Term::atom(
        scope,
        b"clause/source-effect-world-v1".to_vec(),
        MOONWELL_PULSE_SOURCE.to_vec(),
        EqualityContract::ExactOctetsV1,
    )?;
    candidate.initial_state_views = vec![InitialStateViewV2 {
        session,
        payload: initial_payload.clone(),
        canonical_state_snapshot: canonical_term_bytes(&initial_payload)?.into_boxed_slice(),
    }];
    candidate.claimed_snapshot = derive_program_snapshot_id(&candidate.snapshot)?;
    let bytes = encode_process_package(&candidate)?;
    let checked = check_process_package(decode_process_package(&bytes)?)?;
    Ok((checked, mode.id))
}

fn effect_physical_plan(
    package: &CheckedProcessPackage,
    mode: ModeLocalId,
) -> Result<ExecutablePhysicalPlanV1, Box<dyn Error>> {
    let constitution = package.constitution();
    let declaration = constitution
        .preimage()
        .applications
        .iter()
        .find(|candidate| candidate.id == EFFECT_APPLICATION_LOCAL)
        .ok_or_else(|| io::Error::other("effect Application is missing"))?;
    Ok(ExecutablePhysicalPlanV1 {
        application_shape: constitution
            .application_shape(EFFECT_APPLICATION_LOCAL)
            .ok_or_else(|| io::Error::other("effect Application has no shape"))?,
        mode: ModeId {
            operator: OperatorRef {
                snapshot: constitution.snapshot(),
                local: declaration.form.operator,
            },
            local: mode,
        },
        refinement: ExecutableRefinementV1::ClosedApplicationRuleMachineV1,
        target: ExecutablePhysicalTargetV1::PortableScalarInterpreterV1,
        input: None,
        program: ExecutableProgramV1 {
            initial_configuration: vec![ExecutableValueV1::number(0.0)?],
            rules: vec![],
            projection: None,
        },
    })
}

fn opaque_effect_step(value: f64) -> Result<Vec<u8>, Box<dyn Error>> {
    Ok(encode_executable_occurrence_v1(&ExecutableOccurrenceV1 {
        entry: EFFECT_ENTRY,
        arguments: vec![ExecutableValueV1::number(value)?],
    })?)
}

fn execute_exact_file_effect(target: &Path, exact_payload: &[u8]) -> io::Result<Vec<u8>> {
    let parent = target
        .parent()
        .ok_or_else(|| io::Error::other("effect target has no parent"))?;
    fs::create_dir_all(parent)?;
    fs::write(target, exact_payload)?;
    fs::read(target)
}
