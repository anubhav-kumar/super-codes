defmodule LiveBettingWeb.MatchLive.Form do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Matches
  alias LiveBetting.Matches.Match

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        {@page_title}
        <:subtitle>Use this form to manage match records in your database.</:subtitle>
      </.header>

      <.form for={@form} id="match-form" phx-change="validate" phx-submit="save">
        <.input field={@form[:team_a_name]} type="text" label="Team a name" />
        <.input field={@form[:team_b_name]} type="text" label="Team b name" />
        <.input field={@form[:sport]} type="text" label="Sport" />
        <.input field={@form[:status]} type="text" label="Status" />
        <.input field={@form[:winning_team]} type="text" label="Winning team" />
        <.input field={@form[:starts_at]} type="datetime-local" label="Starts at" />
        <.input field={@form[:ends_at]} type="datetime-local" label="Ends at" />
        <footer>
          <.button phx-disable-with="Saving..." variant="primary">Save Match</.button>
          <.button navigate={return_path(@return_to, @match)}>Cancel</.button>
        </footer>
      </.form>
    </Layouts.app>
    """
  end

  @impl true
  def mount(params, _session, socket) do
    {:ok,
     socket
     |> assign(:return_to, return_to(params["return_to"]))
     |> apply_action(socket.assigns.live_action, params)}
  end

  defp return_to("show"), do: "show"
  defp return_to(_), do: "index"

  defp apply_action(socket, :edit, %{"id" => id}) do
    match = Matches.get_match!(id)

    socket
    |> assign(:page_title, "Edit Match")
    |> assign(:match, match)
    |> assign(:form, to_form(Matches.change_match(match)))
  end

  defp apply_action(socket, :new, _params) do
    match = %Match{}

    socket
    |> assign(:page_title, "New Match")
    |> assign(:match, match)
    |> assign(:form, to_form(Matches.change_match(match)))
  end

  @impl true
  def handle_event("validate", %{"match" => match_params}, socket) do
    changeset = Matches.change_match(socket.assigns.match, match_params)
    {:noreply, assign(socket, form: to_form(changeset, action: :validate))}
  end

  def handle_event("save", %{"match" => match_params}, socket) do
    save_match(socket, socket.assigns.live_action, match_params)
  end

  defp save_match(socket, :edit, match_params) do
    case Matches.update_match(socket.assigns.match, match_params) do
      {:ok, match} ->
        {:noreply,
         socket
         |> put_flash(:info, "Match updated successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, match))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp save_match(socket, :new, match_params) do
    case Matches.create_match(match_params) do
      {:ok, match} ->
        {:noreply,
         socket
         |> put_flash(:info, "Match created successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, match))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp return_path("index", _match), do: ~p"/matches"
  defp return_path("show", match), do: ~p"/matches/#{match}"
end
