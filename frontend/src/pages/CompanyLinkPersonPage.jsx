import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '../components/Card.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormError from '../components/FormError.jsx';
import FormFooter from '../components/FormFooter.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PageTitle from '../components/PageTitle.jsx';
import PersonPicker, { pickedPersonId, toAssociationInput } from '../components/PersonPicker.jsx';
import SelectField from '../components/SelectField.jsx';
import { addAssociation } from '../api/companies.js';
import { RELATIONSHIP_TYPES } from '../constants/clients.js';
import { useCompany } from '../hooks/useCompanies.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';

const ALREADY_LINKED = 'This person is already linked to this company';

function LinkPersonForm({ company }) {
    const navigate = useNavigate();
    const [person, setPerson] = useState(null);
    const [relationshipType, setRelationshipType] = useState('');
    const [errors, setErrors] = useState({});
    const { submit, submitting, formError, fieldErrors, clearErrors } = useSubmit();
    // Set when a save failed because the connection dropped; the server may have written it anyway.
    const retrying = useRef(false);
    const linkedIds = (company.associations || []).map((a) => a.personId);
    const detailPath = `/companies/${company.id}`;

    const handleSubmit = async (e) => {
        e.preventDefault();
        const next = {};
        if (!person) next.person = 'Choose a person';
        else if (linkedIds.includes(pickedPersonId(person))) next.person = ALREADY_LINKED;
        if (!relationshipType) next.relationshipType = 'Choose a relationship type';
        setErrors(next);
        if (Object.keys(next).length) return;

        const result = await submit(() => addAssociation(company.id, toAssociationInput(person, relationshipType)));
        if (result.ok) {
            navigate(detailPath, { replace: true });
            return;
        }
        const error = result.error;
        if (error && error.code === 'ASSOCIATION_EXISTS') {
            // A retried save whose first attempt reached the server: treat as success (contract F-03).
            if (retrying.current) {
                clearErrors();
                navigate(detailPath, { replace: true });
                return;
            }
            setErrors({ person: error.message || ALREADY_LINKED });
        }
        if (!error || error.offline) retrying.current = true;
    };

    // ASSOCIATION_EXISTS is shown under the person field only, not again in the banner.
    const banner = errors.person ? null : formError;
    const personError = errors.person || fieldErrors.personId || Object.entries(fieldErrors).find(([f]) => f.startsWith('person'))?.[1];

    return (
        <>
            <PageTitle title="Link person" subtitle={company.name} />
            <form noValidate onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
                <FormError message={banner} />
                <Card>
                    <PersonPicker
                        label="Person"
                        required
                        allowQuickAdd
                        value={person}
                        excludeIds={linkedIds}
                        onChange={(p) => {
                            setPerson(p);
                            setErrors((e) => ({ ...e, person: undefined }));
                        }}
                        error={personError}
                    />
                    <SelectField
                        label="Relationship"
                        required
                        placeholder="Choose…"
                        options={RELATIONSHIP_TYPES}
                        value={relationshipType}
                        onChange={(v) => {
                            setRelationshipType(v);
                            setErrors((e) => ({ ...e, relationshipType: undefined }));
                        }}
                        error={errors.relationshipType || fieldErrors.relationshipType}
                    />
                </Card>
                <FormFooter submitLabel="Link person" submitting={submitting} cancelTo={detailPath} />
            </form>
        </>
    );
}

/** Link person to company (/companies/:companyId/people/new), F-03. Online only. */
export default function CompanyLinkPersonPage() {
    const { companyId } = useParams();
    const navigate = useNavigate();
    const { online } = useOnlineStatus();
    const company = useCompany(companyId);
    const [hadConnection, setHadConnection] = useState(online);
    useEffect(() => {
        if (online) setHadConnection(true);
    }, [online]);

    return (
        <PageBody width="form">
            <PageHeader backTo={`/companies/${companyId}`} backLabel="Company" />
            {!online && !hadConnection ? (
                <EmptyState
                    icon="offline"
                    title="Adding and editing need a connection"
                    text="Connect to the internet and try again."
                    action={{ label: 'Go back', onClick: () => navigate(-1) }}
                />
            ) : (
                <DataView resource={company}>{(c) => <LinkPersonForm key={c.id} company={c} />}</DataView>
            )}
        </PageBody>
    );
}
